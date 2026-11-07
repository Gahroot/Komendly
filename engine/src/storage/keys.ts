// Storage key layout. Run assets are temporary (7-day TTL); brand assets are kept.
function clean(s: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error(`unsafe key segment: ${s}`);
  return s;
}

export function runKey(workspaceId: string, runId: string, ...rest: string[]): string {
  return ["ws", clean(workspaceId), "runs", clean(runId), ...rest].join("/");
}

export function brandKey(workspaceId: string, brandProfileId: string, ...rest: string[]): string {
  return ["ws", clean(workspaceId), "brand", clean(brandProfileId), ...rest].join("/");
}

export function isBrandKey(key: string): boolean {
  return /^ws\/[^/]+\/brand\//.test(key);
}
