// Media I/O used by the job: download, FAL CDN upload, ffprobe, silence detection, slicing, finish.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSilenceDetect, speechEndFromSilenceDetect, type Silence } from "./chunking";
import { falUpload } from "./fal-queue";
import { buildIphoneFinishArgs, concatArgs, probeDuration, runFfmpeg, padAudioArgs, silenceDetectArgs, sliceAudioArgs, type FinishOptions } from "./ffmpeg";

export interface MediaOps {
  download(url: string, dest: string, signal?: AbortSignal): Promise<void>;
  upload(file: string, contentType: string, signal?: AbortSignal): Promise<string>;
  probe(file: string, signal?: AbortSignal): Promise<number>;
  silences(file: string, signal?: AbortSignal): Promise<Silence[]>;
  /** Seconds at which speech ends (trailing silence start), or the file duration. */
  speechEnd(file: string, signal?: AbortSignal): Promise<number>;
  slice(file: string, start: number, end: number, out: string, signal?: AbortSignal): Promise<void>;
  finish(o: FinishOptions, signal?: AbortSignal): Promise<void>;
  pad(file: string, seconds: number, out: string, signal?: AbortSignal): Promise<void>;
  /** Hard-cut join (sub-takes of one clip). */
  concat(inputs: FinishOptions["inputs"], out: string, signal?: AbortSignal): Promise<void>;
}

export function realMedia(fetchImpl: typeof fetch = fetch): MediaOps {
  return {
    async download(url, dest, signal) {
      const r = await fetchImpl(url, { signal });
      if (!r.ok) throw new Error(`download failed ${r.status}: ${url.slice(0, 80)}`);
      await writeFile(dest, Buffer.from(await r.arrayBuffer()));
    },
    async upload(file, contentType, signal) {
      return falUpload(await readFile(file), contentType, path.basename(file), { fetchImpl, signal });
    },
    probe: (file, signal) => probeDuration(file, signal),
    async silences(file, signal) {
      const { stderr } = await runFfmpeg(silenceDetectArgs(file), signal);
      return parseSilenceDetect(stderr);
    },
    async speechEnd(file, signal) {
      const dur = await probeDuration(file, signal);
      const { stderr } = await runFfmpeg(silenceDetectArgs(file, -35, 0.3), signal);
      return speechEndFromSilenceDetect(stderr, dur);
    },
    async slice(file, start, end, out, signal) {
      await runFfmpeg(sliceAudioArgs(file, start, end, out), signal);
    },
    async pad(file, seconds, out, signal) {
      await runFfmpeg(padAudioArgs(file, seconds, out), signal);
    },
    async concat(inputs, out, signal) {
      await runFfmpeg(concatArgs(inputs, out), signal);
    },
    async finish(o, signal) {
      await runFfmpeg(buildIphoneFinishArgs(o), signal);
    },
  };
}
