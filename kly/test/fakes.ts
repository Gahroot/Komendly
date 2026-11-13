// Test fakes: a Prisma-shaped db where every model method is a recorded async stub, and a scripted AI provider.
import type { Db } from "../src/db";
import type { AIProvider } from "../src/ai";

export type Handler = (args: unknown) => unknown;
export interface FakeDb {
  db: Db;
  calls: Array<{ model: string; method: string; args: unknown }>;
  of: (model: string, method: string) => unknown[];
}

const DEFAULTS: Record<string, unknown> = { count: 0, findMany: [], findFirst: null, findUnique: null };

export function fakeDb(handlers: Record<string, Record<string, Handler>> = {}): FakeDb {
  const calls: FakeDb["calls"] = [];
  const db = new Proxy({}, {
    get(_t, model: string) {
      if (model === "$transaction") return async (x: unknown) => (Array.isArray(x) ? Promise.all(x) : (x as (tx: unknown) => unknown)(db));
      if (model === "$executeRaw") return async () => 0;
      return new Proxy({}, {
        get(_t2, method: string) {
          return async (args: unknown) => {
            calls.push({ model, method, args });
            const h = handlers[model]?.[method];
            return h ? h(args) : (DEFAULTS[method] ?? {});
          };
        },
      });
    },
  }) as unknown as Db;
  return { db, calls, of: (model, method) => calls.filter((c) => c.model === model && c.method === method).map((c) => c.args) };
}

/** Provider answering each text() call with the next JSON in the script. */
export function scriptedProvider(answers: unknown[]): AIProvider {
  const queue = [...answers];
  return {
    name: "codex",
    text: async () => ({ text: "", json: queue.shift(), usage: { costMicros: 0, latencyMs: 1 } }),
    image: async () => {
      throw new Error("no images in tests");
    },
    health: async () => ({ ok: true }),
  };
}
