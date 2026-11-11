import type { ClipRow, TestimonialStore, VideoRow } from "../../src/testimonial/store";

export interface World {
  user: { minutesUsed: number };
  video: VideoRow & { minutesReserved: number; finalVideoUrl?: string; fullScript?: string; scriptSource?: string; totalClips: number; currentClip: number; costMicros: number; progress: string[] };
  clips: ClipRow[];
}

export function world(reserved = 1): World {
  return {
    user: { minutesUsed: reserved },
    video: {
      id: "v1", status: "pending", targetDuration: 30, voiceId: "nova",
      reviewText: "Best coffee in town. The staff remembered my name after one visit.", reviewerName: "Ana", businessName: "Bean Bar",
      actor: { id: "a1", gender: "female", referenceImageUrl: "https://img/a1.png", voiceId: "voice-ana", voiceProvider: "fal", voiceSettings: { speed: 1 }, voicePrompt: "Warm alto, light Texan accent" },
      pipelineState: {}, minutesState: "reserved", minutesReserved: reserved, totalClips: 1, currentClip: 0, costMicros: 0, progress: [],
    },
    clips: [{ id: "p0", clipIndex: 0, clipType: "testimonial", scriptContent: "provisional", deliveryDirection: null, audioUrl: null, videoUrl: null, duration: null, startMs: null, endMs: null, status: "pending", costMicros: 0 }],
  };
}

export function memStore(w: World): TestimonialStore {
  let n = 0;
  return {
    async load() {
      return { video: structuredClone({ ...w.video }), clips: structuredClone(w.clips) };
    },
    async saveScript(_id, s) {
      w.video.fullScript = s.fullScript;
      w.video.scriptSource = s.scriptSource;
      w.video.pipelineState = s.state;
    },
    async replaceClips(_id, clips, state) {
      if (w.clips.some((c) => c.status === "completed")) throw new Error("refusing");
      w.clips = clips.map((c) => ({ ...c, id: `c${n++}`, videoUrl: null, duration: null, status: "pending", costMicros: 0 }));
      w.video.totalClips = clips.length;
      w.video.pipelineState = state;
    },
    async updateVideo(_id, d) {
      if (d.status) w.video.status = d.status;
      if (d.currentClip !== undefined) w.video.currentClip = d.currentClip;
      if (d.pipelineState) w.video.pipelineState = d.pipelineState;
      if (d.status) w.video.progress.push(d.status);
    },
    async updateClip(id, d) {
      const c = w.clips.find((x) => x.id === id);
      if (!c) throw new Error("no clip");
      Object.assign(c, { status: d.status ?? c.status, videoUrl: d.videoUrl ?? c.videoUrl, costMicros: d.costMicros ?? c.costMicros });
      w.video.progress.push(`${c.clipIndex}:${c.status}`);
    },
    async complete(_id, r) {
      if (w.video.minutesState === "reserved") {
        const charged = Math.min(r.minutes, w.video.minutesReserved);
        w.user.minutesUsed -= w.video.minutesReserved - charged;
        w.video.minutesState = "charged";
      }
      Object.assign(w.video, { status: "completed", finalVideoUrl: r.finalVideoUrl, costMicros: r.costMicros });
    },
    async lockActorVoice(_actorId, voiceId) {
      const a = w.video.actor;
      if (!(a.voiceProvider === "kling" && a.voiceId)) Object.assign(a, { voiceProvider: "kling", voiceId });
      return a.voiceId ?? voiceId;
    },
    async fail() {
      if (w.video.status === "completed") return false;
      w.video.status = "failed";
      if (w.video.minutesState !== "reserved") return false;
      w.video.minutesState = "released";
      w.user.minutesUsed -= w.video.minutesReserved;
      return true;
    },
  };
}

