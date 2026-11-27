// Objection map: classify free-text signals (replies, cancel reasons, abandoned checkouts) into hesitation themes,
// count them and keep a few anonymised quotes. Pure. Keyword rules, not AI: the agent only interprets the aggregate.
export interface Signal { source: string; text: string; at?: string }
export interface ObjectionTheme { theme: string; label: string; count: number; share: number; sources: Record<string, number>; quotes: string[] }

const THEMES: readonly { theme: string; label: string; re: RegExp }[] = [
  { theme: "price", label: "Price / cost", re: /\b(price|pricey|cost|expensive|afford|cheap|budget|too much|\$\d+)\b/i },
  { theme: "trust", label: "Trust / is it real", re: /\b(scam|legit|spam|real company|who are you|reviews?|proof|case stud|trust)\b/i },
  { theme: "results_doubt", label: "Doubt it will bring leads", re: /\b(will it work|doesn'?t work|no leads|results?|roi|waste|worth it|did(n'?t)? (get|see))\b/i },
  { theme: "complexity", label: "Facebook / setup feels hard", re: /\b(facebook|meta|ads manager|business (manager|account)|set ?up|connect|complicated|confus\w*|hard)\b/i },
  { theme: "time_effort", label: "No time / too much effort", re: /\b(no time|busy|too much work|don'?t have time|time[- ]consuming)\b/i },
  { theme: "has_provider", label: "Already has an agency or provider", re: /\b(agency|already (have|use|work)|my (marketer|guy|team)|in-house|someone (does|handles))\b/i },
  { theme: "not_now", label: "Not now / bad timing", re: /\b(not (right )?now|later|next (month|quarter|year)|off[- ]season|slow season|maybe (later|another time))\b/i },
  { theme: "fit", label: "Wrong fit / not my business type", re: /\b(not (a|for)|doesn'?t (fit|apply)|wrong|not relevant|my (industry|trade)|we'?re a)\b/i },
  { theme: "commitment", label: "Commitment / cancelling worry", re: /\b(cancel\w*|contract|commit\w*|locked in|subscription|auto[- ]?renew)\b/i },
  { theme: "ad_quality", label: "Ads look generic / off-brand", re: /\b(generic|template|ugly|off[- ]brand|doesn'?t look|not my (logo|brand)|wrong (logo|colou?rs?))\b/i },
  { theme: "ad_spend", label: "Worried about ad spend", re: /\b(ad spend|spend|charged|overspend|hidden (fee|cost))\b/i },
];

/** Strip anything that identifies a person: emails, phones, urls, handles, "my name is X", sign-offs. Trim to 160. */
export function anonymise(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/https?:\/\/\S+|www\.\S+/gi, "[link]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]").replace(/@\w{2,}/g, "[handle]");
  t = t.replace(/\b(my name is|i'?m|i am|this is|it'?s)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?/g, "$1 [name]");
  t = t.replace(/(thanks|regards|best|cheers|sincerely)[,!. ]+[A-Z][a-z]+.*$/i, "$1");
  return t.length > 160 ? `${t.slice(0, 157)}...` : t;
}

export function classify(text: string): string[] {
  return THEMES.filter((t) => t.re.test(text)).map((t) => t.theme);
}

export function buildObjectionMap(signals: readonly Signal[], opts: { maxQuotes?: number; minLen?: number } = {}): { themes: ObjectionTheme[]; classified: number; total: number } {
  const maxQuotes = opts.maxQuotes ?? 3;
  const usable = signals.filter((s) => s.text.trim().length >= (opts.minLen ?? 8));
  const by = new Map<string, ObjectionTheme>();
  let classified = 0;
  for (const s of usable) {
    const ts = classify(s.text);
    if (ts.length) classified++;
    for (const id of ts) {
      const def = THEMES.find((t) => t.theme === id)!;
      const cur = by.get(id) ?? { theme: id, label: def.label, count: 0, share: 0, sources: {}, quotes: [] };
      cur.count++;
      cur.sources[s.source] = (cur.sources[s.source] ?? 0) + 1;
      const q = anonymise(s.text);
      if (cur.quotes.length < maxQuotes && !cur.quotes.includes(q)) cur.quotes.push(q);
      by.set(id, cur);
    }
  }
  const themes = [...by.values()].map((t) => ({ ...t, share: usable.length ? Math.round((t.count / usable.length) * 100) / 100 : 0 })).sort((a, b) => b.count - a.count);
  return { themes, classified, total: usable.length };
}
