import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readXlsxRows } from "../src/coach/xlsx";
import { parseReportRows } from "../../src/lib/ads/coach/table";

/** Tiny zip writer (deflate) for test fixtures. CRC is not checked by the reader, so it is left 0. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const data = deflateRawSync(raw);
    const n = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(n.length, 26);
    locals.push(lh, n, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

describe("readXlsxRows", () => {
  it("reads shared strings, inline strings and numbers from a Meta-like export", () => {
    const shared = ["Ad name", "Amount spent (USD)", "Impressions", "Results", "Cost per result", "Winner &amp; co", "Loser"];
    const buf = zip({
      "xl/workbook.xml": `<workbook><sheets><sheet name="Raw Data Report" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>
        <row r="2"><c r="A2" t="s"><v>5</v></c><c r="B2"><v>120.5</v></c><c r="C2"><v>8000</v></c><c r="D2"><v>12</v></c><c r="E2"><v>10.04</v></c></row>
        <row r="3"><c r="A3" t="inlineStr"><is><t>Loser</t></is></c><c r="B3"><v>99</v></c><c r="C3"><v>6000</v></c><c r="E3"><v>99</v></c></row>
      </sheetData></worksheet>`,
    });
    const rows = readXlsxRows(buf);
    expect(rows[1]).toEqual(["Winner & co", "120.5", "8000", "12", "10.04"]);
    const r = parseReportRows(rows);
    expect(r.ok && r.report.ads.map((a) => [a.name, a.spend, a.results])).toEqual([["Winner & co", 120.5, 12], ["Loser", 99, null]]);
  });
});
