// MetaPublisher over the Marketing API (Graph) with the user's Facebook Login for Business token.
import { actId, adPayload, adSetPayload, campaignPayload, creativePayload } from "./mapping";
import { MetaApiError, type FetchLike, type MetaAdAccount, type MetaPage, type MetaPublisher, type UploadedMedia } from "./types";

export const DEFAULT_GRAPH_VERSION = "v25.0";

export interface GraphOptions {
  accessToken: string;
  version?: string;
  fetch?: FetchLike;
}

export class GraphClient {
  readonly base: string;
  private readonly f: FetchLike;
  constructor(private readonly o: GraphOptions) {
    this.base = `https://graph.facebook.com/${o.version ?? DEFAULT_GRAPH_VERSION}`;
    this.f = o.fetch ?? fetch;
  }

  async request<T>(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    const url = new URL(`${this.base}/${path.replace(/^\//, "")}`);
    const headers: Record<string, string> = { authorization: `Bearer ${this.o.accessToken}` };
    let body: string | undefined;
    if (method === "GET") {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
    } else {
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) form.set(k, typeof v === "string" ? v : JSON.stringify(v));
      body = form.toString();
      headers["content-type"] = "application/x-www-form-urlencoded";
    }
    const res = await this.f(url, { method, headers, body, signal });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_user_msg?: string } } & T;
    if (!res.ok || json.error) {
      const e = json.error;
      throw new MetaApiError(e?.error_user_msg ?? e?.message ?? `Meta API error ${res.status}`, res.status, e?.code);
    }
    return json;
  }
}

export class GraphMetaPublisher implements MetaPublisher {
  readonly mode = "graph" as const;
  readonly graph: GraphClient;
  constructor(opts: GraphOptions) {
    this.graph = new GraphClient(opts);
  }

  async listAdAccounts(signal?: AbortSignal): Promise<MetaAdAccount[]> {
    const r = await this.graph.request<{ data: Array<{ id: string; name?: string; currency?: string }> }>(
      "GET", "me/adaccounts", { fields: "id,name,currency", limit: "100" }, signal);
    return r.data.map((a) => ({ id: a.id, name: a.name ?? a.id, currency: a.currency }));
  }

  async listPages(signal?: AbortSignal): Promise<MetaPage[]> {
    const r = await this.graph.request<{ data: Array<{ id: string; name?: string }> }>("GET", "me/accounts", { fields: "id,name", limit: "100" }, signal);
    return r.data.map((p) => ({ id: p.id, name: p.name ?? p.id }));
  }

  async uploadMedia(adAccountId: string, media: Parameters<MetaPublisher["uploadMedia"]>[1], signal?: AbortSignal): Promise<UploadedMedia> {
    return uploadViaGraph(this.graph, adAccountId, media, signal);
  }

  async createCampaign(adAccountId: string, input: Parameters<MetaPublisher["createCampaign"]>[1], signal?: AbortSignal) {
    return (await this.graph.request<{ id: string }>("POST", `${actId(adAccountId)}/campaigns`, campaignPayload(input), signal)).id;
  }

  async createAdSet(adAccountId: string, input: Parameters<MetaPublisher["createAdSet"]>[1], signal?: AbortSignal) {
    return (await this.graph.request<{ id: string }>("POST", `${actId(adAccountId)}/adsets`, adSetPayload(input), signal)).id;
  }

  async createAd(adAccountId: string, input: Parameters<MetaPublisher["createAd"]>[1], signal?: AbortSignal) {
    const creative = await this.graph.request<{ id: string }>(
      "POST", `${actId(adAccountId)}/adcreatives`,
      creativePayload({ name: input.name, pageId: input.pageId, objective: input.objective, copy: input.copy, media: input.media }), signal);
    const ad = await this.graph.request<{ id: string }>(
      "POST", `${actId(adAccountId)}/ads`, adPayload({ name: input.name, adSetId: input.adSetId, creativeId: creative.id }), signal);
    return { adId: ad.id, creativeId: creative.id };
  }
}

/** Media upload through the Marketing API (also used by the MCP publisher: the MCP server has no upload tool). */
export async function uploadViaGraph(
  graph: GraphClient, adAccountId: string, media: Parameters<MetaPublisher["uploadMedia"]>[1], signal?: AbortSignal,
): Promise<UploadedMedia> {
  if (media.kind === "image") {
    const r = await graph.request<{ images: Record<string, { hash: string }> }>(
      "POST", `${actId(adAccountId)}/adimages`, { bytes: Buffer.from(media.bytes).toString("base64"), name: media.filename }, signal);
    const first = Object.values(r.images)[0];
    if (!first) throw new MetaApiError("Meta did not return an image hash");
    return { kind: "image", imageHash: first.hash };
  }
  const r = await graph.request<{ id: string }>("POST", `${actId(adAccountId)}/advideos`, { file_url: media.fileUrl, name: media.filename }, signal);
  return { kind: "video", videoId: r.id, thumbnailUrl: media.thumbnailUrl };
}
