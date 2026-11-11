// Studio uploads: presigned PUT + existence check. Same S3 env as src/lib/ads/storage.ts (GETs reuse presignGet there).
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_PRESIGN_SECONDS } from "@/lib/ads/storage";

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

/** Presigned PUT (<= 10 min). The browser must send the same Content-Type. */
export async function presignPut(key: string, contentType: string, seconds = MAX_PRESIGN_SECONDS): Promise<string> {
  const command = new PutObjectCommand({ Bucket: env("S3_BUCKET"), Key: key, ContentType: contentType });
  return getSignedUrl(client(), command, { expiresIn: Math.min(seconds, MAX_PRESIGN_SECONDS) });
}

/** Size of an object, or null when it doesn't exist. */
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const out = await client().send(new HeadObjectCommand({ Bucket: env("S3_BUCKET"), Key: key }));
    return out.ContentLength ?? 0;
  } catch {
    return null;
  }
}
