// Ozzy Ad Coach: deterministic reading of a Meta Ads Manager export (CSV text or rows from XLSX).
// Pure: no I/O. Tolerates Meta's naming variants ("Amount spent (USD)", "Cost per results", "CTR (all)", ...).

export type MetricField =
  | "adName"
  | "adSetName"
  | "campaignName"
  | "spend"
  | "impressions"
  | "reach"
  | "frequency"
  | "clicks"
  | "ctr"
  | "cpc"
  | "results"
  | "resultType"
  | "costPerResult"
  | "purchases"
  | "leads"
  | "roas"
  | "purchaseValue"
  | "headline"
  | "body"
  | "delivery"
  | "starts"
  | "ends";

/** Header patterns per field, most specific first (earlier pattern wins when several columns match). */
const FIELD_PATTERNS: Array<[MetricField, RegExp[]]> = [
  ["adName", [/^ad name$/, /^ad$/, /^ads?$/, /^anzeigenname$/, /^nom de la publicite$/, /^nombre del anuncio$/]],
  ["adSetName", [/^ad set name$/, /^adset name$/, /^ad set$/]],
  ["campaignName", [/^campaign name$/, /^campaign$/]],
  ["spend", [/^amount spent$/, /^spend$/, /^amount spend$/, /^spent$/, /^cost$/, /^ausgegebener betrag$/, /^montant depense$/, /^importe gastado$/]],
  ["impressions", [/^impressions$/, /^impr$/, /^impressionen$/, /^impresiones$/]],
  ["reach", [/^reach$/, /^reichweite$/, /^alcance$/, /^couverture$/]],
  ["frequency", [/^frequency$/, /^frequenz$/, /^frecuencia$/]],
  ["clicks", [/^link clicks$/, /^clicks link$/, /^outbound clicks$/, /^clicks all$/, /^clicks$/, /^link-klicks$/]],
  ["ctr", [/^ctr link click-through rate$/, /^link ctr$/, /^ctr outbound$/, /^ctr all$/, /^ctr$/]],
  ["cpc", [/^cpc cost per link click$/, /^cost per link click$/, /^cpc all$/, /^cpc$/]],
  ["results", [/^results$/, /^result$/, /^ergebnisse$/, /^resultados$/, /^resultats$/]],
  ["resultType", [/^result indicator$/, /^result type$/, /^results type$/]],
  ["costPerResult", [/^cost per results?$/, /^kosten pro ergebnis$/, /^costo por resultado$/, /^cout par resultat$/]],
  ["purchases", [/^purchases$/, /^website purchases$/, /^results purchases$/, /^käufe$/, /^compras$/]],
  ["leads", [/^leads$/, /^website leads$/, /^on-facebook leads$/, /^meta leads$/, /^leads form$/]],
  ["roas", [/^purchase roas return on ad spend$/, /^website purchase roas return on ad spend$/, /^purchase roas$/, /^roas$/]],
  ["purchaseValue", [/^purchases conversion value$/, /^website purchases conversion value$/, /^conversion value$/, /^purchase value$/]],
  ["headline", [/^headline$/, /^title$/, /^ad headline$/]],
  ["body", [/^body$/, /^primary text$/, /^body asset$/]],
  ["delivery", [/^ad delivery$/, /^delivery$/, /^delivery status$/]],
  ["starts", [/^reporting starts$/, /^starts$/, /^day$/, /^date$/]],
  ["ends", [/^reporting ends$/, /^ends$/]],
];

/** Lowercase, drop accents, currency/unit parentheticals ("(USD)", "(€)"), punctuation noise. */
export function normalizeHeader(h: string): { key: string; currency: string | null } {
  const raw = h.replace(/^\uFEFF/, "").trim();
  const cur = raw.match(/\((USD|EUR|GBP|CAD|AUD|NZD|CHF|SEK|NOK|DKK|PLN|BRL|MXN|INR|JPY|ZAR|[$€£])\)/i);
  const key = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((usd|eur|gbp|cad|aud|nzd|chf|sek|nok|dkk|pln|brl|mxn|inr|jpy|zar|[$€£])\)/g, "")
    .replace(/cost per 1,000 impressions/g, "")
    .replace(/[()]/g, " ")
    .replace(/[:_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sym = cur?.[1]?.toUpperCase() ?? null;
  const currency = sym === "$" ? "USD" : sym === "€" ? "EUR" : sym === "£" ? "GBP" : sym;
  return { key, currency };
}

/** Map column index -> field. Each field takes the best-ranked matching column. */
export function mapColumns(headers: string[]): { columns: Partial<Record<MetricField, number>>; currency: string | null } {
  const norm = headers.map(normalizeHeader);
  const columns: Partial<Record<MetricField, number>> = {};
  const used = new Set<number>();
  for (const [field, patterns] of FIELD_PATTERNS) {
    for (const re of patterns) {
      const idx = norm.findIndex((n, i) => !used.has(i) && re.test(n.key));
      if (idx >= 0) {
        columns[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  const currency = norm.find((n) => n.currency)?.currency ?? null;
  return { columns, currency };
}

/** RFC 4180-ish CSV parser (quotes, escaped quotes, CRLF, BOM). Auto-detects `,` `;` or tab. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => ({ d, n: firstLine.split(d).length }));
  const delim = counts.sort((a, b) => b.n - a.n)[0]?.d ?? ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** "$1,234.56" / "1.234,56 €" / "2.5%" / "—" -> number | null. */
export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.trim().replace(/[\s\u00a0$€£%]|USD|EUR|GBP/g, "");
  if (!s || s === "-" || s === "—" || s === "–") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // "12,000" / "1,234,567" = thousands; "45,50" / "0,73" = decimal comma.
    s = /^-?[1-9]\d{0,2}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(/,/g, ".");
  } else if (/^-?[1-9]\d{0,2}(\.\d{3}){2,}$/.test(s) || /^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) {
    // "3.200" / "1.234.567" = dot thousands (EU exports; Meta writes money/ratios with 2 decimals).
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface AdMetrics {
  name: string;
  headline: string | null;
  body: string | null;
  adSetName: string | null;
  delivery: string | null;
  resultType: string | null;
  spend: number;
  impressions: number;
  reach: number | null;
  frequency: number | null;
  clicks: number | null;
  ctr: number | null; // percent
  cpc: number | null;
  results: number | null;
  costPerResult: number | null;
  purchases: number | null;
  leads: number | null;
  roas: number | null;
  /** Days covered by the report for this ad (from Reporting starts/ends), or null. */
  days: number | null;
}

export interface ParsedReport {
  ads: AdMetrics[];
  currency: string | null;
  /** Fields found in the header, for telling the user what was read. */
  found: MetricField[];
}

export type ParseResult = { ok: true; report: ParsedReport } | { ok: false; reason: "no_header" | "no_ad_column" | "no_metrics" | "no_rows" };

interface Acc {
  name: string;
  headline: string | null;
  body: string | null;
  adSetName: string | null;
  delivery: string | null;
  resultType: string | null;
  spend: number;
  impressions: number;
  reach: number | null;
  clicks: number | null;
  results: number | null;
  purchases: number | null;
  leads: number | null;
  purchaseValue: number | null;
  ctrW: number; // ctr * impressions (when clicks are missing)
  roasW: number; // roas * spend (when value is missing)
  cprFromCol: number | null;
  cpcFromCol: number | null;
  freqFromCol: number | null;
  start: number | null;
  end: number | null;
}

const add = (a: number | null, b: number | null): number | null => (b === null ? a : (a ?? 0) + b);
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

function parseDay(raw: string | undefined): number | null {
  if (!raw) return null;
  const t = Date.parse(raw.trim());
  return Number.isFinite(t) ? t : null;
}

/** Find the header row (first row with an ad-name-like column and a metric), aggregate per ad name. */
export function parseReportRows(rows: string[][]): ParseResult {
  const headerIdx = rows.slice(0, 15).findIndex((r) => {
    const m = mapColumns(r).columns;
    return (m.adName ?? m.adSetName ?? m.campaignName) !== undefined && (m.spend !== undefined || m.impressions !== undefined);
  });
  if (headerIdx < 0) {
    const anyName = rows.slice(0, 15).some((r) => {
      const m = mapColumns(r).columns;
      return (m.adName ?? m.adSetName ?? m.campaignName) !== undefined;
    });
    return { ok: false, reason: anyName ? "no_metrics" : rows.length ? "no_ad_column" : "no_header" };
  }
  const header = rows[headerIdx] ?? [];
  const { columns: col, currency } = mapColumns(header);
  const nameCol = col.adName ?? col.adSetName ?? col.campaignName;
  if (nameCol === undefined) return { ok: false, reason: "no_ad_column" };
  const get = (r: string[], f: MetricField): string | undefined => {
    const i = col[f];
    return i === undefined ? undefined : r[i];
  };
  const num = (r: string[], f: MetricField) => parseNumber(get(r, f));
  const byName = new Map<string, Acc>();
  for (const r of rows.slice(headerIdx + 1)) {
    const name = (r[nameCol] ?? "").trim();
    // Meta's footer/summary rows ("Results from 12 ads", "Total") and blank names are skipped.
    if (!name || /^(total|totals|summe|gesamt|results from \d+)/i.test(name)) continue;
    const a: Acc = byName.get(name) ?? {
      name,
      headline: null,
      body: null,
      adSetName: null,
      delivery: null,
      resultType: null,
      spend: 0,
      impressions: 0,
      reach: null,
      clicks: null,
      results: null,
      purchases: null,
      leads: null,
      purchaseValue: null,
      ctrW: 0,
      roasW: 0,
      cprFromCol: null,
      cpcFromCol: null,
      freqFromCol: null,
      start: null,
      end: null,
    };
    const spend = num(r, "spend") ?? 0;
    const impressions = num(r, "impressions") ?? 0;
    a.spend += spend;
    a.impressions += impressions;
    a.reach = add(a.reach, num(r, "reach"));
    a.clicks = add(a.clicks, num(r, "clicks"));
    a.results = add(a.results, num(r, "results"));
    a.purchases = add(a.purchases, num(r, "purchases"));
    a.leads = add(a.leads, num(r, "leads"));
    a.purchaseValue = add(a.purchaseValue, num(r, "purchaseValue"));
    a.ctrW += (num(r, "ctr") ?? 0) * impressions;
    a.roasW += (num(r, "roas") ?? 0) * spend;
    a.cprFromCol ??= num(r, "costPerResult");
    a.cpcFromCol ??= num(r, "cpc");
    a.freqFromCol ??= num(r, "frequency");
    a.headline ??= get(r, "headline")?.trim() || null;
    a.body ??= get(r, "body")?.trim() || null;
    a.adSetName ??= col.adName !== undefined ? get(r, "adSetName")?.trim() || null : null;
    a.delivery ??= get(r, "delivery")?.trim() || null;
    a.resultType ??= get(r, "resultType")?.trim() || null;
    const s = parseDay(get(r, "starts"));
    const e = parseDay(get(r, "ends")) ?? s;
    if (s !== null) a.start = a.start === null ? s : Math.min(a.start, s);
    if (e !== null) a.end = a.end === null ? e : Math.max(a.end, e);
    byName.set(name, a);
  }
  if (byName.size === 0) return { ok: false, reason: "no_rows" };
  const ads: AdMetrics[] = [...byName.values()].map((a) => {
    const ctr = a.clicks !== null && a.impressions > 0 ? (a.clicks / a.impressions) * 100 : a.impressions > 0 && a.ctrW > 0 ? a.ctrW / a.impressions : null;
    const cpc = a.clicks && a.clicks > 0 ? a.spend / a.clicks : a.cpcFromCol;
    const results = a.results ?? a.purchases ?? a.leads;
    const cpr = results && results > 0 ? a.spend / results : results === 0 ? null : a.cprFromCol;
    const roas = a.purchaseValue !== null && a.spend > 0 ? a.purchaseValue / a.spend : a.spend > 0 && a.roasW > 0 ? a.roasW / a.spend : null;
    const freq = a.reach && a.reach > 0 ? a.impressions / a.reach : a.freqFromCol;
    const days = a.start !== null && a.end !== null ? Math.max(1, Math.round((a.end - a.start) / 86_400_000) + 1) : null;
    return {
      name: a.name,
      headline: a.headline,
      body: a.body,
      adSetName: a.adSetName,
      delivery: a.delivery,
      resultType: a.resultType,
      spend: round(a.spend, 2),
      impressions: Math.round(a.impressions),
      reach: a.reach === null ? null : Math.round(a.reach),
      frequency: freq === null ? null : round(freq, 2),
      clicks: a.clicks === null ? null : Math.round(a.clicks),
      ctr: ctr === null ? null : round(ctr, 2),
      cpc: cpc === null ? null : round(cpc, 2),
      results: results === null ? null : round(results, 2),
      costPerResult: cpr === null ? null : round(cpr, 2),
      purchases: a.purchases,
      leads: a.leads,
      roas: roas === null ? null : round(roas, 2),
      days,
    };
  });
  ads.sort((x, y) => y.spend - x.spend || x.name.localeCompare(y.name));
  const found = (Object.keys(col) as MetricField[]).sort();
  return { ok: true, report: { ads, currency, found } };
}

export function parseCsvReport(text: string): ParseResult {
  return parseReportRows(parseCsv(text));
}
