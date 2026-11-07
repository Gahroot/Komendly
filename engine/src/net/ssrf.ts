// SSRF guard: only public http(s) hosts. DNS is resolved and every address checked
// (private, loopback, link-local, CGNAT, metadata, multicast, reserved, IPv6 ULA/mapped).
// Used for every navigation, sub-request and redirect hop.
import { lookup } from "node:dns/promises";
import net from "node:net";

export class BlockedUrlError extends Error {}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped?.[1]) return isBlockedIp(mapped[1]);
    if (s === "::" || s === "::1") return true;
    if (/^f[cd]/.test(s)) return true; // ULA fc00::/7
    if (/^fe[89ab]/.test(s)) return true; // link-local fe80::/10
    if (/^ff/.test(s)) return true; // multicast
    if (s.startsWith("64:ff9b:") || s.startsWith("2001:db8:") || s.startsWith("fd00:ec2:")) return true;
    return false;
  }
  return true;
}

const BLOCKED_HOSTS = /(^|\.)(localhost|internal|local|localdomain|railway\.internal|metadata\.google\.internal)$/i;

export type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Throws BlockedUrlError unless the URL is http(s) on a standard port and resolves only to public IPs. */
export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrlError(`invalid URL: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedUrlError(`blocked scheme ${u.protocol}`);
  if (u.username || u.password) throw new BlockedUrlError("credentials in URL");
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) throw new BlockedUrlError(`blocked port ${u.port}`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.test(host)) throw new BlockedUrlError(`blocked host ${host}`);
  const ips = net.isIP(host) ? [host] : await resolve(host).catch(() => {
    throw new BlockedUrlError(`DNS failed for ${host}`);
  });
  if (ips.length === 0) throw new BlockedUrlError(`no address for ${host}`);
  const bad = ips.find(isBlockedIp);
  if (bad) throw new BlockedUrlError(`blocked address ${bad} for ${host}`);
  return u;
}

/** fetch with SSRF checks on every redirect hop and size/time limits. */
export async function safeFetch(
  url: string,
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; resolve?: Resolver; signal?: AbortSignal } = {},
): Promise<{ url: string; status: number; contentType: string; body: Buffer }> {
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  const signal = AbortSignal.any([AbortSignal.timeout(opts.timeoutMs ?? 15_000), ...(opts.signal ? [opts.signal] : [])]);
  let current = url;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    await assertPublicUrl(current, opts.resolve);
    const res = await fetch(current, { redirect: "manual", signal, headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location") ?? "", current).toString();
      continue;
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) throw new BlockedUrlError(`response too large (${len})`);
    const chunks: Buffer[] = [];
    let total = 0;
    if (res.body) {
      for await (const chunk of res.body) {
        total += (chunk as Uint8Array).byteLength;
        if (total > maxBytes) throw new BlockedUrlError("response too large");
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
    }
    return { url: current, status: res.status, contentType: res.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
  }
  throw new BlockedUrlError("too many redirects");
}

// Realistic desktop Chrome UA: many sites serve bots/headless a block page.
export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
