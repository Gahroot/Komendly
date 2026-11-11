// Pure helpers to recognise Meta-owned (AS32934) client IPs, e.g. Meta's ad-review crawler loading every ad link
// with a normal browser UA. Ranges: AS32934 announced prefixes (ipverse/asn-ip, 2026-11) merged with known supernets.

const META_V4 = [
  "31.13.24.0/21", "31.13.64.0/18", "45.64.40.0/22", "57.141.0.0/19", "57.144.0.0/14", "66.220.144.0/20", "69.63.176.0/20",
  "69.171.224.0/19", "74.119.76.0/22", "102.132.96.0/20", "103.4.96.0/22", "129.134.0.0/16", "157.240.0.0/16", "163.70.128.0/17",
  "163.77.128.0/18", "173.252.64.0/18", "179.60.192.0/22", "185.60.216.0/22", "185.89.216.0/22", "204.15.20.0/22",
] as const;
const META_V6 = ["2a03:2880::/32", "2a03:83e0::/32", "2620:0:1c00::/40"] as const;

function v4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts.reduce((acc, p) => acc * 256 + p, 0);
}

/** IPv6 as 8 16-bit groups, or null. Handles `::` and an embedded IPv4 tail. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0] ?? "";
  const v4tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4tail?.[1]) {
    const n = v4ToInt(v4tail[1]);
    if (n === null) return null;
    s = `${s.slice(0, -v4tail[1].length)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (h: string | undefined) => (h ? h.split(":") : []);
  const head = parse(halves[0]);
  const tail = parse(halves[1]);
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (all.length !== 8 || all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

/** Normalise `x-forwarded-for` style values; IPv4-mapped IPv6 (::ffff:a.b.c.d) becomes plain IPv4. */
function normalise(ip: string): string {
  const t = ip.trim().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(t);
  return mapped?.[1] ?? t;
}

function inV4(ipInt: number, cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const b = v4ToInt(base ?? "");
  const n = Number(bits);
  if (b === null) return false;
  const size = 2 ** (32 - n);
  return Math.floor(ipInt / size) === Math.floor(b / size);
}

function inV6(groups: number[], cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const b = v6Groups(base ?? "");
  if (!b) return false;
  let left = Number(bits);
  for (let i = 0; i < 8 && left > 0; i++) {
    const take = Math.min(16, left);
    const shift = 16 - take;
    if (((groups[i] ?? 0) >> shift) !== ((b[i] ?? 0) >> shift)) return false;
    left -= take;
  }
  return true;
}

/** True when `ip` is in a Meta-owned range (AS32934). */
export function isMetaIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const s = normalise(ip);
  const n = v4ToInt(s);
  if (n !== null) return META_V4.some((c) => inV4(n, c));
  const g = v6Groups(s);
  return !!g && META_V6.some((c) => inV6(g, c));
}

/** Coarse network for auditing (never the full IP): IPv4 first 3 octets (`a.b.c.0/24`), IPv6 first 48 bits (`x:y:z::/48`). */
export function coarseIpNet(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  const s = normalise(ip);
  if (v4ToInt(s) !== null) return `${s.split(".").slice(0, 3).join(".")}.0/24`;
  const g = v6Groups(s);
  return g ? `${g.slice(0, 3).map((x) => x.toString(16)).join(":")}::/48` : undefined;
}

/** Client IP from proxy headers (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIpFromHeaders(h: Headers): string | undefined {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || undefined;
}
