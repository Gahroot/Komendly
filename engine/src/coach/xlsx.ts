// Minimal XLSX reader (first worksheet -> string rows). No dependency: zip central directory + inflateRaw.
// Enough for Meta Ads Manager exports (shared strings, inline strings, numbers); formulas read their cached value.
import { inflateRawSync } from "node:zlib";

const MAX_ENTRY_BYTES = 50 * 1024 * 1024;

function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip directory");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^xl\/(sharedStrings|workbook|worksheets\/sheet\d+)\.xml$|^xl\/_rels\/workbook\.xml\.rels$/.test(name)) continue;
    if (usize > MAX_ENTRY_BYTES) throw new Error("xlsx entry too large");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    out.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }));
  }
  return out;
}

function xmlText(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** First worksheet as rows of strings (sparse cells filled with ""). */
export function readXlsxRows(buf: Buffer): string[][] {
  const files = unzip(buf);
  const shared = (files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").match(/<si>[\s\S]*?<\/si>/g)?.map((si) => xmlText((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? []).join(""))) ?? [];
  // First sheet in workbook order (falls back to the lowest-numbered sheet file).
  const wb = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const rid = wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const target = rid ? rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] ?? rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`))?.[1] : undefined;
  const sheetName = target ? `xl/${target.replace(/^\/?xl\//, "")}` : [...files.keys()].filter((k) => k.startsWith("xl/worksheets/")).sort()[0];
  const sheet = (sheetName && files.get(sheetName)?.toString("utf8")) || "";
  if (!sheet) throw new Error("xlsx has no worksheet");
  const rows: string[][] = [];
  for (const rowXml of sheet.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    const row: string[] = [];
    let next = 0;
    for (const c of rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const ref = c.match(/\br="([A-Z]+\d+)"/)?.[1];
      const idx = ref ? colIndex(ref) : next;
      const type = c.match(/\bt="([^"]+)"/)?.[1];
      const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = "";
      if (type === "s" && v !== undefined) val = shared[Number(v)] ?? "";
      else if (type === "inlineStr") val = xmlText(c.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else if (v !== undefined) val = xmlText(v);
      while (row.length < idx) row.push("");
      row[idx] = val;
      next = idx + 1;
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
