import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Api, ApiError } from "./client.js";

const MIMES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

export function mimeFor(file: string): string | undefined {
  return MIMES[extname(file).toLowerCase()];
}

export interface UploadResult {
  upload_id: string;
  filename: string;
  mime: string;
  bytes: number;
  status: string;
}

interface UploadView {
  id: string;
  filename: string;
  mime: string;
  bytes: number;
  status: string;
}

/** The studio upload handshake: POST /api/studio/uploads -> presigned PUT -> POST /uploads/:id/complete. */
export async function uploadFile(api: Api, file: string, opts: { sessionId?: string; log: (line: string) => void }): Promise<UploadResult> {
  const mime = mimeFor(file);
  if (!mime) throw new ApiError(`Ozzy can use MP4, MOV, WebM, PNG, JPG, WebP, MP3, WAV or M4A files (got ${basename(file)}).`, 415, "unsupported_type");
  let bytes: number;
  try {
    bytes = (await stat(file)).size;
  } catch {
    throw new ApiError(`Can't read ${file}.`, 0, "file_missing");
  }
  const filename = basename(file);
  opts.log(`Uploading ${filename} (${Math.max(1, Math.round(bytes / 1024 / 1024))} MB)…`);
  const start = await api.json<{ upload: UploadView; putUrl: string; headers?: Record<string, string> }>("POST", "/api/studio/uploads", {
    filename,
    mime,
    bytes,
    ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
  });
  const body = await readFile(file);
  let put: Response;
  try {
    put = await api.fetch(start.putUrl, { method: "PUT", headers: start.headers ?? { "Content-Type": mime }, body });
  } catch {
    throw new ApiError("The upload didn't go through. Check your connection and try again.", 0, "network");
  }
  if (!put.ok) throw new ApiError(`The upload didn't go through (storage returned HTTP ${put.status}). Try again.`, put.status, "upload_failed");
  const done = await api.json<{ upload: UploadView }>("POST", `/api/studio/uploads/${encodeURIComponent(start.upload.id)}/complete`);
  return { upload_id: done.upload.id, filename: done.upload.filename, mime: done.upload.mime, bytes: done.upload.bytes, status: done.upload.status };
}

export function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  const plain = /filename="?([^";]+)"?/i.exec(header);
  const raw = star?.[1] ? decodeURIComponent(star[1].replace(/"/g, "")) : plain?.[1];
  const name = raw ? basename(raw.trim()) : "";
  return name && name !== "." && name !== ".." ? name : undefined;
}

/**
 * GET an authenticated download route and save it into `outDir`. Redirects (302 to a presigned URL) are followed
 * manually WITHOUT the bearer key, so the key never leaves for the storage host.
 */
export async function downloadTo(api: Api, path: string, outDir: string, fallbackName: string): Promise<{ path: string; bytes: number }> {
  let res = await api.raw(path, { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location) throw new ApiError("The download link was missing. Try again.", res.status, "no_location");
    try {
      res = await api.fetch(new URL(location, api.baseUrl).toString());
    } catch {
      throw new ApiError("The download didn't go through. Check your connection and try again.", 0, "network");
    }
    if (!res.ok) throw new ApiError(`The download link failed (HTTP ${res.status}). Try again.`, res.status, "download_failed");
  } else if (!res.ok) {
    throw await api.errorFrom(res);
  }
  const name = filenameFromDisposition(res.headers.get("content-disposition")) ?? fallbackName;
  await mkdir(outDir, { recursive: true });
  const target = join(outDir, name);
  if (!res.body) throw new ApiError("The download was empty.", res.status, "empty");
  await pipeline(Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>), createWriteStream(target));
  return { path: target, bytes: (await stat(target)).size };
}
