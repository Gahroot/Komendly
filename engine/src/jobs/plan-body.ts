// Hard cap on ad body copy: trim at a sentence, else a word boundary, else drop.
export const BODY_MAX = 90;

export function capBody(body: string | undefined, max = BODY_MAX): string | undefined {
  const b = body?.trim();
  if (!b) return undefined;
  if (b.length <= max) return b;
  const head = b.slice(0, max + 1);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentenceEnd >= 20) return head.slice(0, sentenceEnd + 1);
  const space = b.slice(0, max).lastIndexOf(" ");
  if (space < 20) return undefined;
  return b.slice(0, space).replace(/[,;:\-–—]+$/, "");
}
