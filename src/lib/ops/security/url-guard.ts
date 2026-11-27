// SSRF guard for server-side fetches of user-influenced URLs in the web app (the engine has its own in engine/src/net/ssrf.ts).
// Pure except for the injectable DNS resolver. https only, no credentials, standard ports, every resolved address public.
import net from "node:net";

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const v4ToInt = (ip: string) => ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped?.[1]) return isBlockedIp(mapped[1]);
    if (s === "::" || s === "::1") return true;
    return /^f[cdef]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8:");
  }
  return true;
}

const BLOCKED_HOSTS = /(^|\.)(localhost|internal|local|localdomain|railway\.internal|metadata\.google\.internal)$/i;

export type Resolver = (host: string) => Promise<string[]>;

export class BlockedUrlError extends Error {}

/** Throws BlockedUrlError unless `raw` is a public https URL. Returns the parsed URL. */
export async function assertPublicHttpsUrl(raw: string, resolve: Resolver): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new BlockedUrlError("invalid URL"); }
  if (u.protocol !== "https:") throw new BlockedUrlError("https only");
  if (u.username || u.password) throw new BlockedUrlError("credentials in URL");
  if (u.port && u.port !== "443") throw new BlockedUrlError("blocked port");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.test(host)) throw new BlockedUrlError("blocked host");
  const ips = net.isIP(host) ? [host] : await resolve(host).catch(() => { throw new BlockedUrlError("DNS failed"); });
  if (ips.length === 0 || ips.some(isBlockedIp)) throw new BlockedUrlError("blocked address");
  return u;
}

/** A header-safe download filename (no quotes, CR/LF or path separators). */
export function safeDownloadName(name: string | null | undefined, fallback = "video.mp4"): string {
  const s = (name ?? "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 120);
  return s || fallback;
}
