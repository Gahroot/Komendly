// MetaPublisher contract shared by the web app (account picker) and the engine (publish job).
import type { MetaObjective, PlacementGroup, CreativeCopy } from "./mapping";

export type MetaPublishMode = "mcp" | "graph";

export interface MetaAdAccount { id: string; name: string; currency?: string }
export interface MetaPage { id: string; name: string }

export type MetaMedia =
  | { kind: "image"; bytes: Uint8Array; mime: string; filename: string }
  | { kind: "video"; fileUrl: string; thumbnailUrl: string; filename: string };

export type UploadedMedia = { kind: "image"; imageHash: string } | { kind: "video"; videoId: string; thumbnailUrl: string };

export interface MetaPublisher {
  readonly mode: MetaPublishMode;
  listAdAccounts(signal?: AbortSignal): Promise<MetaAdAccount[]>;
  listPages(signal?: AbortSignal): Promise<MetaPage[]>;
  uploadMedia(adAccountId: string, media: MetaMedia, signal?: AbortSignal): Promise<UploadedMedia>;
  createCampaign(adAccountId: string, input: { name: string; objective: MetaObjective }, signal?: AbortSignal): Promise<string>;
  createAdSet(
    adAccountId: string,
    input: { name: string; campaignId: string; objective: MetaObjective; group: PlacementGroup; dailyBudgetMinor: number; countries: string[] },
    signal?: AbortSignal,
  ): Promise<string>;
  createAd(
    adAccountId: string,
    input: { name: string; adSetId: string; pageId: string; objective: MetaObjective; copy: CreativeCopy; media: UploadedMedia },
    signal?: AbortSignal,
  ): Promise<{ adId: string; creativeId: string }>;
  close?(): Promise<void>;
}

export class MetaApiError extends Error {
  constructor(message: string, public status?: number, public code?: number) {
    super(message);
  }
}

/** Decrypted contents of MetaConnection.encryptedToken. */
export interface StoredMetaToken {
  mode: MetaPublishMode;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
