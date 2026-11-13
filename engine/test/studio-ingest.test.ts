import { describe, expect, it } from "vitest";
import { extractOgMedia, fetchReference, isPlatformUrl, mediaTypeOf, ytDlpPath } from "../src/studio/ingest";
import { describeUpload, studioBrief, turnPrompt } from "../src/studio/brief";
import { normalizeRemixUrl, remixMessage, isReferenceAttachment } from "../../src/lib/studio/contracts";

describe("studio ingest helpers", () => {
  it("recognises platform links", () => {
    for (const u of ["https://www.youtube.com/shorts/abc", "https://youtu.be/x", "https://www.tiktok.com/@a/video/1", "https://www.instagram.com/reel/x/", "https://www.facebook.com/ads/library/?id=1", "https://x.com/a/status/1"]) expect(isPlatformUrl(u), u).toBe(true);
    for (const u of ["https://example.com/ad.mp4", "https://notyoutube.com.evil.io/", "nope"]) expect(isPlatformUrl(u), u).toBe(false);
  });

  it("types media from content-type or extension", () => {
    expect(mediaTypeOf("video/mp4; charset=x", "https://a.io/x")).toBe("video/mp4");
    expect(mediaTypeOf("image/jpg", "https://a.io/x")).toBe("image/jpeg");
    expect(mediaTypeOf("application/octet-stream", "https://a.io/clip.MOV")).toBe("video/quicktime");
    expect(mediaTypeOf("text/html", "https://a.io/x.mp4")).toBeNull();
  });

  it("reads og:video before og:image, resolving relative links", () => {
    const html = `<meta property="og:image" content="/img.jpg"><meta content="https://cdn.io/v.mp4?a=1&amp;b=2" property="og:video:secure_url"><meta name="twitter:player:stream" content="https://cdn.io/s.mp4">`;
    expect(extractOgMedia(html, "https://brand.io/page")).toEqual(["https://cdn.io/v.mp4?a=1&b=2", "https://cdn.io/s.mp4", "https://brand.io/img.jpg"]);
    expect(extractOgMedia("<p>none</p>", "https://brand.io")).toEqual([]);
  });

  it("finds yt-dlp from YTDLP_PATH only when it exists", async () => {
    expect(await ytDlpPath({ YTDLP_PATH: "/nope/yt-dlp", PATH: "/nope" })).toBeNull();
  });

  it("refuses private and non-http links before fetching", async () => {
    const ac = new AbortController();
    for (const u of ["http://127.0.0.1/a.mp4", "file:///etc/passwd", "http://169.254.169.254/latest", "http://localhost/x"]) await expect(fetchReference(u, "/tmp", ac.signal), u).rejects.toThrow();
  });
});

describe("remix contract + brief", () => {
  it("normalizes links and builds the chat message", () => {
    expect(normalizeRemixUrl(" youtube.com/shorts/x ")).toBe("https://youtube.com/shorts/x");
    expect(normalizeRemixUrl("ftp://a.io/x")).toBeNull();
    expect(normalizeRemixUrl("not a link")).toBeNull();
    expect(remixMessage({ url: "https://a.io/x", notes: "Make it 9:16." })).toBe("Remix this ad for my brand: https://a.io/x\n\nMake it 9:16.");
    expect(remixMessage({})).toBe("Remix this ad for my brand.");
    expect(isReferenceAttachment({ uploadId: "u", reference: true })).toBe(true);
    expect(isReferenceAttachment({ uploadId: "u" })).toBe(false);
  });

  it("marks the reference and adds remix rules only when there is one", () => {
    const ref = { file: "reference.mp4", kind: "video" as const, durationSec: 15, width: 1080, height: 1920, reference: true };
    expect(describeUpload(ref)).toContain("REFERENCE AD");
    const brief = studioBrief({ brand: null, uploads: [ref], paid: false });
    expect(brief).toContain("## Remixing a reference ad");
    expect(brief).toMatch(/NEVER copy the original's logos, people, footage/);
    expect(brief).toContain("beat map");
    expect(studioBrief({ brand: null, uploads: [{ ...ref, reference: undefined }], paid: false })).not.toContain("## Remixing a reference ad");
    expect(turnPrompt({ userText: "Remix this ad for my brand: https://a.io", firstTurn: true, attached: [ref] })).toContain("This is a remix");
    expect(turnPrompt({ userText: "hi", firstTurn: true, attached: [] })).not.toContain("remix");
  });
});
