// Ozzy Studio live preview: S3 reads (manifest + ranged file streams). Same S3 env as src/lib/ads/storage.ts.
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { LiveManifest } from "./contracts";
import { parseLiveManifest } from "./live";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function client(): S3Client {
  return new S3Client({
    endpoint: env("S3_ENDPOINT"),
    region: process.env.S3_REGION || "auto",
    forcePathStyle: process.env.S3_URL_STYLE === "path",
    credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") },
  });
}

export async function readLiveManifest(key: string, signal?: AbortSignal): Promise<LiveManifest | null> {
  try {
    const out = await client().send(new GetObjectCommand({ Bucket: env("S3_BUCKET"), Key: key }), { abortSignal: signal });
    return out.Body ? parseLiveManifest(await out.Body.transformToString()) : null;
  } catch {
    return null;
  }
}

/** Stream one object (optionally a byte range). Null when it doesn't exist. */
export async function getLiveObject(key: string, range: { start: number; end: number } | null, signal?: AbortSignal): Promise<{ body: ReadableStream<Uint8Array>; length: number | undefined; contentRange: string | undefined } | null> {
  try {
    const out = await client().send(new GetObjectCommand({ Bucket: env("S3_BUCKET"), Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }), { abortSignal: signal });
    if (!out.Body) return null;
    return { body: out.Body.transformToWebStream(), length: out.ContentLength, contentRange: out.ContentRange };
  } catch {
    return null;
  }
}
