import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Presigned URLs never live longer than 10 minutes. */
export const MAX_PRESIGN_SECONDS = 600;

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

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "file";
}

/** Short-lived GET URL; `downloadName` forces an attachment download. */
export async function presignGet(key: string, opts: { seconds?: number; downloadName?: string } = {}): Promise<string> {
  const seconds = Math.min(opts.seconds ?? 300, MAX_PRESIGN_SECONDS);
  const command = new GetObjectCommand({
    Bucket: env("S3_BUCKET"),
    Key: key,
    ResponseContentDisposition: opts.downloadName ? `attachment; filename="${safeFilename(opts.downloadName)}"` : undefined,
  });
  return getSignedUrl(client(), command, { expiresIn: seconds });
}

/** SigV4 maximum (7 days). Only for links handed to the user's own agent/tools (MCP outputs), never for page loads. */
export const MAX_SHARE_PRESIGN_SECONDS = 7 * 24 * 60 * 60;

/** Long-lived GET URL an external service (e.g. a Meta Ads tool) can fetch later. Served inline with its real type. */
export async function presignShareable(key: string, opts: { seconds?: number; contentType?: string } = {}): Promise<string> {
  const seconds = Math.min(opts.seconds ?? MAX_SHARE_PRESIGN_SECONDS, MAX_SHARE_PRESIGN_SECONDS);
  const command = new GetObjectCommand({ Bucket: env("S3_BUCKET"), Key: key, ResponseContentType: opts.contentType });
  return getSignedUrl(client(), command, { expiresIn: seconds });
}

export async function getObjectStream(key: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const out = await client().send(new GetObjectCommand({ Bucket: env("S3_BUCKET"), Key: key }), { abortSignal: signal });
  if (!out.Body) throw new Error(`Empty object ${key}`);
  return out.Body.transformToWebStream();
}

export async function putObject(key: string, body: Uint8Array | string, contentType: string): Promise<void> {
  await client().send(new PutObjectCommand({ Bucket: env("S3_BUCKET"), Key: key, Body: body, ContentType: contentType }));
}

export function extensionForMime(mime: string): string {
  if (mime === "video/mp4") return "mp4";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}
