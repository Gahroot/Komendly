// Ozzy Studio: the ./studio.md brief block and the per-turn prompt the agent receives.
import { STUDIO_MAX_SECONDS } from "../../../src/lib/studio/contracts";

export interface BriefBrand {
  name: string | null;
  url: string | null;
  colors: Array<{ hex: string; role?: string }>;
  fonts: Array<{ family: string; role?: string }>;
  logoFile: string | null;
}

export interface BriefUpload {
  file: string;
  kind: "video" | "image" | "audio" | "file";
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

/** Clean, unique file names for ./uploads (deterministic in input order). */
export function cleanUploadNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const m = /^(.*?)(\.[A-Za-z0-9]{1,5})?$/.exec(n.split(/[\\/]/).pop() ?? "file") ?? [];
    const base = (m[1] ?? "file").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "file";
    const ext = (m[2] ?? "").toLowerCase();
    let name = `${base}${ext}`;
    for (let i = 2; used.has(name); i++) name = `${base}-${i}${ext}`;
    used.add(name);
    return name;
  });
}

export function describeUpload(u: BriefUpload): string {
  const parts: string[] = [u.kind];
  if (u.durationSec) parts.push(`${u.durationSec.toFixed(1)}s`);
  if (u.width && u.height) parts.push(`${u.width}x${u.height}`);
  return `./uploads/${u.file} (${parts.join(", ")})`;
}

export function studioBrief(o: { brand: BriefBrand | null; uploads: BriefUpload[]; paid: boolean }): string {
  const max = o.paid ? STUDIO_MAX_SECONDS.paid : STUDIO_MAX_SECONDS.free;
  const lines = [
    "# Ozzy Studio brief",
    "",
    "You are Ozzy, Komendly's video maker, chatting with a busy business owner (not a designer) in a web chat. Plain, friendly, short words. They only see your chat messages and the finished video: never mention files, folders, commands, tools or this brief.",
    "",
    "## Their files",
    o.uploads.length ? o.uploads.map((u) => `- ${describeUpload(u)}`).join("\n") : "- (no uploads yet)",
    "- Uploads are in ./uploads/. Never change or delete them; write edits and cut clips elsewhere in the project.",
    "- ffmpeg and ffprobe are on PATH: use them to look at, trim, crop, reframe, join and mix footage (e.g. cut clips into a vertical ad, then lay captions and music over them in a HyperFrames composition that plays the cut clips, or burn simple captions with ffmpeg).",
  ];
  if (o.brand) {
    lines.push("", "## Their brand");
    if (o.brand.name) lines.push(`- Name: ${o.brand.name}`);
    if (o.brand.url) lines.push(`- Website: ${o.brand.url}`);
    if (o.brand.colors.length) lines.push(`- Colours: ${o.brand.colors.map((c) => `${c.hex}${c.role ? ` (${c.role})` : ""}`).join(", ")}`);
    if (o.brand.fonts.length) lines.push(`- Fonts: ${o.brand.fonts.map((f) => `${f.family}${f.role ? ` (${f.role})` : ""}`).join(", ")}`);
    if (o.brand.logoFile) lines.push(`- Logo: ./brand/${o.brand.logoFile}`);
    lines.push("- Use the brand when it fits the request; the user's words win over it.");
  }
  lines.push(
    "",
    "## Rules for this studio",
    `- Length: the finished video must be at most ${max} seconds (longer output is cut off).`,
    "- RENDERING: NEVER run `hf render`, `hyperframes render`, motion-blur.mjs or reveal.mjs. The studio renders the final video itself, faster, right after you finish, and shows the user progress. Your job: build or edit the HyperFrames composition (index.html), check a few stills with `hf snapshot`, fix what looks wrong, then stop and tell the user it's ready. Skip the final render (the studio renders it).",
    "- Pure footage edits with no composition (only ffmpeg cuts/joins/captions on their clips) are the one exception: write that MP4 into ./renders/ with a new name each time (v1.mp4, v2.mp4, ...).",
    "- The browser for snapshots is already set up (HYPERFRAMES_BROWSER_PATH); don't install or look for Chrome.",
    "- Never add a watermark, \"made with\" credit or Komendly branding: the studio adds it itself when needed.",
    "- Questions: if the request is clear enough, just build it. Ask only for what you truly can't decide (at most one ask_user card, all questions on it, and only before you start building). Asking ends this turn; the user's next chat message is the answer.",
    "- The user is a business owner, not a technician. Only ever ask about creative choices they'd recognise (what to say, the look, music, where it will be shown). NEVER ask about technical things: sessions, previews, servers, processes, installs, permissions, files, rendering, exports or errors. Decide those yourself and handle them silently; you already have permission to stop your own preview servers and background tasks, overwrite your own project files and retry.",
    "- After the first message of a chat, don't ask questions at all: make your best call, do it, and say in one line what you assumed.",
    "- Revisions: change only what they asked, keep everything else, render a new version.",
    "- Before you finish, check every scene change: look at stills just before and just after each cut (`hf snapshot --at` around the cut times) and make sure scene changes are clean and there are no stutters (no blank or half-built frame, no jump back, no element popping in late or twice).",
    "- Their footage is theirs to use; don't ask about rights for it.",
  );
  return lines.join("\n") + "\n";
}

/** What the agent receives this turn: the user's words plus a short note about new files. */
export const STUDIO_NO_RENDER_NOTE = "Do NOT run hf render, motion-blur.mjs or reveal.mjs: build the composition, check stills, and stop; the studio renders the final video itself.";

export function turnPrompt(o: { userText: string; firstTurn: boolean; attached: BriefUpload[] }): string {
  const note: string[] = [STUDIO_NO_RENDER_NOTE];
  if (o.firstTurn) note.push("Read ./studio.md first: it describes this studio, the user's files and the delivery rules.");
  if (o.attached.length) note.push(`Attached with this message: ${o.attached.map(describeUpload).join("; ")}.`);
  const text = o.userText.trim() || "(no text: see the attached files)";
  return `${text}\n\n[Studio note: ${note.join(" ")}]`;
}
