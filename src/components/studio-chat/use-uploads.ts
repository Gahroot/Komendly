"use client";
// Attachment chips: presigned PUT straight to S3 with real progress (XHR), then /complete.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { STUDIO_UPLOAD_LIMITS } from "@/lib/studio/contracts";
import type { UploadView } from "@/lib/studio/thread";
import { api } from "./api";

export interface Chip {
  localId: string;
  name: string;
  mime: string;
  bytes: number;
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  upload?: UploadView;
}

function putWithProgress(url: string, file: File, mime: string, onProgress: (p: number) => void, register: (x: XMLHttpRequest) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.onabort = () => resolve(false);
    xhr.send(file);
  });
}

export function useUploads(opts: { sessionId?: string; onUploaded?: (u: UploadView) => void; onError?: (msg: string) => void }) {
  const [chips, setChips] = useState<Chip[]>([]);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const chipsRef = useRef(chips);
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    chipsRef.current = chips;
    optsRef.current = opts;
  });

  const patch = useCallback((localId: string, p: Partial<Chip>) => setChips((prev) => prev.map((c) => (c.localId === localId ? { ...c, ...p } : c))), []);

  const add = useCallback(
    (files: File[]) => {
      const room = STUDIO_UPLOAD_LIMITS.maxFilesPerMessage - chipsRef.current.length;
      if (files.length > room) optsRef.current.onError?.(`Up to ${STUDIO_UPLOAD_LIMITS.maxFilesPerMessage} files per message.`);
      for (const file of files.slice(0, Math.max(0, room))) {
        const mime = file.type || "application/octet-stream";
        if (!(STUDIO_UPLOAD_LIMITS.mimes as readonly string[]).includes(mime)) {
          optsRef.current.onError?.(`${file.name}: Ozzy can use videos (MP4, MOV, WebM), images (PNG, JPG, WebP) and audio (MP3, WAV, M4A).`);
          continue;
        }
        const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const previewUrl = mime.startsWith("image/") || mime.startsWith("video/") ? URL.createObjectURL(file) : null;
        setChips((prev) => [...prev, { localId, name: file.name, mime, bytes: file.size, previewUrl, progress: 0, status: "uploading" }]);
        void (async () => {
          const start = await api<{ upload: UploadView; putUrl: string }>("/api/studio/uploads", { body: { filename: file.name, mime, bytes: file.size, sessionId: optsRef.current.sessionId } });
          if (!start.ok) return patch(localId, { status: "error", error: start.error });
          const ok = await putWithProgress(start.data.putUrl, file, mime, (p) => patch(localId, { progress: p }), (x) => xhrs.current.set(localId, x));
          xhrs.current.delete(localId);
          if (!ok) return patch(localId, { status: "error", error: "Upload failed. Remove it and try again." });
          const done = await api<{ upload: UploadView }>(`/api/studio/uploads/${start.data.upload.id}/complete`, { body: {} });
          if (!done.ok) return patch(localId, { status: "error", error: done.error });
          patch(localId, { status: "done", progress: 1, upload: done.data.upload });
          optsRef.current.onUploaded?.(done.data.upload);
        })();
      }
    },
    [patch],
  );

  const remove = useCallback((localId: string) => {
    xhrs.current.get(localId)?.abort();
    setChips((prev) => {
      const c = prev.find((x) => x.localId === localId);
      if (c?.previewUrl) URL.revokeObjectURL(c.previewUrl);
      return prev.filter((x) => x.localId !== localId);
    });
  }, []);

  /** After sending: chips leave the composer (object URLs are kept for the sent message thumbnails). */
  const clear = useCallback(() => setChips([]), []);

  useEffect(() => () => xhrs.current.forEach((x) => x.abort()), []);

  const busy = chips.some((c) => c.status === "uploading");
  const readyIds = chips.filter((c) => c.status === "done" && c.upload).map((c) => c.upload?.id ?? "");
  return { chips, add, remove, clear, busy, readyIds };
}
