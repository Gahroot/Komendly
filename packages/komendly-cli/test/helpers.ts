import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { Deps } from "../src/commands.js";

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

type Handler = (call: Call) => Response | Promise<Response>;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}

/** Routes match on "METHOD pathname" (query ignored) or a full-URL prefix; handlers are consumed in order if arrays. */
export function mockFetch(routes: Record<string, Handler | Handler[]>) {
  const calls: Call[] = [];
  const queues = new Map(Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]));
  const fetchImpl = async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const headers = Object.fromEntries(Object.entries((init.headers as Record<string, string> | undefined) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = typeof init.body === "string" ? init.body : init.body ? "<binary>" : undefined;
    const call = { url: url.toString(), method, headers, body };
    calls.push(call);
    const key = `${method} ${url.pathname}`;
    const entry = queues.get(key) ?? queues.get(`${method} ${url.origin}${url.pathname}`);
    if (!entry) return json({ error: "Not found.", code: "not_found" }, 404);
    if (Array.isArray(entry)) {
      const h = entry.length > 1 ? entry.shift() : entry[0];
      if (!h) throw new Error(`no handler for ${key}`);
      return h(call);
    }
    return entry(call);
  };
  return { fetch: fetchImpl, calls };
}

export async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "komendly-cli-"));
}

export function makeDeps(fetchImpl: Deps["fetch"], over: Partial<Deps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const sleeps: number[] = [];
  let clock = 0;
  const deps: Deps = {
    fetch: fetchImpl,
    env: { KOMENDLY_API_KEY: "kmd_testkey000000000000000000000000000000", KOMENDLY_BASE_URL: "https://k.test" },
    home: "/nonexistent-home",
    stdin: Readable.from([]),
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    ...over,
  };
  return { deps, out: () => out.join(""), err: () => err.join(""), sleeps };
}
