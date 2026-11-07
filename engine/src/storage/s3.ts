// S3-compatible client for the Railway bucket (virtual-host style by default).
import { DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isBrandKey } from "./keys";

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  presignGet(key: string, ttlSeconds?: number): Promise<string>;
  /** Deletes run objects; refuses brand-profile keys. */
  deleteRunObjects(keys: string[]): Promise<number>;
  ping(): Promise<void>;
}

export function createStorage(env: NodeJS.ProcessEnv = process.env): Storage {
  const bucket = env.S3_BUCKET;
  if (!bucket || !env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY are required");
  }
  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? "auto",
    forcePathStyle: env.S3_URL_STYLE === "path",
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  return {
    async put(key, body, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!r.Body) throw new Error(`empty object ${key}`);
      return Buffer.from(await r.Body.transformToByteArray());
    },
    presignGet(key, ttlSeconds = 3600) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSeconds });
    },
    async deleteRunObjects(keys) {
      const safe = keys.filter((k) => !isBrandKey(k));
      let n = 0;
      for (let i = 0; i < safe.length; i += 1000) {
        const chunk = safe.slice(i, i + 1000);
        await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
        n += chunk.length;
      }
      return n;
    },
    async ping() {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    },
  };
}
