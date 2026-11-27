import { describe, expect, it, vi } from "vitest";

const { rows } = vi.hoisted(() => ({ rows: [
  { id: "a", createdAt: new Date(), props: { status: "new", score: 50, url: "https://x/1" } },
  { id: "b", createdAt: new Date(), props: { status: "done", score: 90, url: "https://x/2" } },
  { id: "c", createdAt: new Date(), props: { status: "new", score: 80, url: "https://x/3" } },
] as { id: string; createdAt: Date; props: Record<string, unknown> }[] }));
const { update } = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { adsEvent: { findMany: async () => rows, findFirst: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null, update } } }));
import { GET, POST } from "@/app/api/intent/queue/route";

const req = (method: string, token?: string, body?: unknown) => new Request("http://x/api/intent/queue", { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: body ? JSON.stringify(body) : undefined });

describe("/api/intent/queue", () => {
  it("rejects without the token (and when the env token is unset)", async () => {
    delete process.env.INTENT_AGENT_TOKEN; delete process.env.CRON_SECRET;
    expect((await GET(req("GET", "anything"))).status).toBe(401);
    process.env.INTENT_AGENT_TOKEN = "tok";
    expect((await GET(req("GET"))).status).toBe(401);
  });
  it("lists only new items, best score first; done marks status", async () => {
    process.env.INTENT_AGENT_TOKEN = "tok";
    const j = (await (await GET(req("GET", "tok"))).json()) as { items: { id: string }[] };
    expect(j.items.map((i) => i.id)).toEqual(["c", "a"]);
    const r = await POST(req("POST", "tok", { action: "done", id: "a", outcome: "replied" }));
    expect(await r.json()).toEqual({ status: "done" });
    expect(update.mock.calls[0]![0].data.props).toMatchObject({ status: "done", outcome: "replied" });
    expect((await POST(req("POST", "tok", { action: "done", id: "zz" }))).status).toBe(404);
  });
});
