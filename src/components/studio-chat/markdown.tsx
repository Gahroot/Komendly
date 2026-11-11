// Small, safe markdown for Ozzy's replies: builds React elements (never raw HTML). Streaming-tolerant:
// unfinished syntax (an open ** or ```) renders as plain text until it closes.
import { Fragment, type ReactNode } from "react";

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s<)]+[^\s<).,!?;:'"])/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    const [all, code, bold, bold2, em, em2, link, href, bare] = m;
    if (code) out.push(<code key={k} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em]">{code.slice(1, -1)}</code>);
    else if (bold || bold2) out.push(<strong key={k} className="font-semibold text-[oklch(0.98_0.03_80)]">{inline(all.slice(2, -2), k)}</strong>);
    else if (em || em2) out.push(<em key={k}>{inline(all.slice(1, -1), k)}</em>);
    else if (link && href) out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-[var(--studio-gold)] underline underline-offset-4">{link.slice(1, link.indexOf("]"))}</a>);
    else if (bare) out.push(<a key={k} href={bare} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-[var(--studio-gold)] underline underline-offset-4">{bare}</a>);
    last = at + all.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "code"; text: string; lang: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "hr" };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join("\n") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !/^```\s*$/.test(lines[j] ?? "")) body.push(lines[j++] ?? "");
      blocks.push({ kind: "code", text: body.join("\n"), lang: fence[1] ?? "" });
      i = j;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: "h", level: h[1]?.length ?? 1, text: h[2] ?? "" });
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flush();
      blocks.push({ kind: "hr" });
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const kind = /\d/.test(li[1] ?? "") ? "ol" : "ul";
      const prev = blocks[blocks.length - 1];
      if (prev && prev.kind === kind) prev.items.push(li[2] ?? "");
      else blocks.push({ kind, items: [li[2] ?? ""] });
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flush();
      const prev = blocks[blocks.length - 1];
      if (prev && prev.kind === "quote") prev.text += `\n${q[1] ?? ""}`;
      else blocks.push({ kind: "quote", text: q[1] ?? "" });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

function withBreaks(text: string, key: string): ReactNode[] {
  return text.split("\n").flatMap((l, i) => (i === 0 ? inline(l, `${key}-${i}`) : [<br key={`${key}-br${i}`} />, ...inline(l, `${key}-${i}`)]));
}

export function Markdown({ text, caret }: { text: string; caret?: boolean }) {
  const blocks = parseBlocks(text);
  const caretEl = caret ? <span aria-hidden className="studio-caret" /> : null;
  return (
    <div className="studio-md space-y-3 text-[15px] leading-7">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        const end = i === blocks.length - 1 ? caretEl : null;
        switch (b.kind) {
          case "p":
            return <p key={k}>{withBreaks(b.text, k)}{end}</p>;
          case "h": {
            const cls = b.level <= 2 ? "font-display text-xl" : "text-base font-semibold";
            return <p key={k} role="heading" aria-level={b.level + 1} className={cls}>{inline(b.text, k)}{end}</p>;
          }
          case "code":
            return (
              <pre key={k} className="overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-3 font-mono text-[13px] leading-6">
                <code>{b.text}</code>{end}
              </pre>
            );
          case "ul":
          case "ol": {
            const List = b.kind === "ul" ? "ul" : "ol";
            return (
              <List key={k} className={`${b.kind === "ul" ? "list-disc" : "list-decimal"} space-y-1 pl-5 marker:text-[var(--studio-gold)]`}>
                {b.items.map((it, j) => <li key={`${k}-${j}`}>{inline(it, `${k}-${j}`)}{j === b.items.length - 1 ? end : null}</li>)}
              </List>
            );
          }
          case "quote":
            return <blockquote key={k} className="border-l-2 border-[var(--studio-gold)]/60 pl-3 text-[oklch(0.86_0.03_75)] italic">{withBreaks(b.text, k)}{end}</blockquote>;
          case "hr":
            return <Fragment key={k}><hr className="border-white/10" />{end}</Fragment>;
        }
      })}
      {blocks.length === 0 ? caretEl : null}
    </div>
  );
}
