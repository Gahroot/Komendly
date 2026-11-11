// A/B experiments: deterministic, cookie-backed, vendor-free.
// Pure module (no browser/server imports) so it runs in middleware, server components, the client and tests.

export interface Experiment {
  /** Stable key, sent to analytics as `exp_<key>`. Rename = new experiment. */
  key: string;
  variants: readonly string[];
  /** Relative weights, same length as variants. */
  weights: readonly number[];
  /** Set false to stop assigning; everyone sees variants[0]. */
  active: boolean;
}

export const EXPERIMENTS = {
  /** Homepage hero headline. variants[0] is always the control. */
  home_hero: { key: "home_hero", variants: ["control", "companion"], weights: [50, 50], active: true },
  /** /free-ads: 20 s product demo film under the hero form ("demo") vs the page as it was. Read with scripts/experiment-readout.ts. */
  free_ads_demo: { key: "free_ads_demo", variants: ["control", "demo"], weights: [50, 50], active: true },
} as const satisfies Record<string, Experiment>;

export type ExperimentKey = keyof typeof EXPERIMENTS;
export type Assignments = Partial<Record<ExperimentKey, string>>;

export const ANON_ID_COOKIE = "kmd_aid";
export const EXP_COOKIE = "kmd_exp";
export const EXP_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/** FNV-1a 32-bit. Stable across runtimes. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Same anon id + experiment always gives the same variant. */
export function assignVariant(anonId: string, exp: Experiment): string {
  if (!exp.active) return exp.variants[0];
  const total = exp.weights.reduce((a, b) => a + b, 0);
  const bucket = (hash32(`${exp.key}:${anonId}`) % 10000) / 10000 * total;
  let acc = 0;
  for (let i = 0; i < exp.variants.length; i++) {
    acc += exp.weights[i];
    if (bucket < acc) return exp.variants[i];
  }
  return exp.variants[exp.variants.length - 1];
}

/** "home_hero.companion|other.b" -> { home_hero: "companion", other: "b" }; drops unknown keys/variants. */
export function parseAssignments(raw: string | undefined | null): Assignments {
  const out: Assignments = {};
  if (!raw) return out;
  for (const part of decodeURIComponent(raw).split("|")) {
    const [key, variant] = part.split(".");
    const exp = (EXPERIMENTS as Record<string, Experiment>)[key];
    if (exp && exp.variants.includes(variant)) out[key as ExperimentKey] = variant;
  }
  return out;
}

export function serializeAssignments(a: Assignments): string {
  return Object.entries(a).map(([k, v]) => `${k}.${v}`).join("|");
}

/** Fill in any experiment missing from `current`; inactive experiments are forced to control. */
export function completeAssignments(anonId: string, current: Assignments): Assignments {
  const out: Assignments = {};
  for (const [key, exp] of Object.entries(EXPERIMENTS) as [ExperimentKey, Experiment][]) {
    const existing = current[key];
    out[key] = exp.active && existing && exp.variants.includes(existing) ? existing : assignVariant(anonId, exp);
  }
  return out;
}

/** QA override: ?exp=home_hero.companion */
export function applyOverride(a: Assignments, override: string | null): Assignments {
  return override ? { ...a, ...parseAssignments(override) } : a;
}

/** Analytics params: { exp_home_hero: "companion" }. */
export function experimentParams(a: Assignments): Record<string, string> {
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [`exp_${k}`, v as string]));
}
