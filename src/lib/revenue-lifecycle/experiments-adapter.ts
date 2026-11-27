// Thin port to rev-core's src/lib/revenue/experiments.ts (assignVariant / recordExposure / recordConversion).
// That file did not exist when this was written, so the default adapter below is a local deterministic one that
// writes AdsEvent rows `experiment_exposure` / `experiment_conversion`. When rev-core's module is in, replace
// `localExperiments` with a wrapper over its exports; callers only depend on this interface.
import { spreadSlot } from "../ads/lifecycle/select";

export interface ExperimentDb { adsEvent: { create(args: { data: { name: string; userId?: string | null; workspaceId?: string | null; props: object } }): Promise<unknown> } }
export interface ExperimentPort {
  assign(key: string, subjectId: string, variants: readonly string[]): string;
  exposure(db: ExperimentDb, key: string, variantId: string, subjectId: string, props?: Record<string, unknown>): Promise<void>;
}
export const localExperiments: ExperimentPort = {
  assign: (key, subjectId, variants) => variants[spreadSlot(`${key}:${subjectId}`, variants.length)] ?? variants[0]!,
  async exposure(db, key, variantId, subjectId, props = {}) {
    await db.adsEvent.create({ data: { name: "experiment_exposure", userId: subjectId, props: { key, variantId, ...props } } });
  },
};
