// Which Codex model runs an Ozzy Studio turn. The first video of a chat gets the strongest model (Sol); edits of a
// video Ozzy already made ("make the logo bigger") run on the cheap model (Luna), which is ~45x cheaper per token and
// twice as fast (bench 13 Nov 2026). Env: STUDIO_AGENT_MODEL/THINKING (first video), STUDIO_EDIT_MODEL/THINKING (edits;
// STUDIO_EDIT_MODEL=same keeps every turn on the first-video model).
import { STUDIO_DEFAULT_MODEL, STUDIO_DEFAULT_THINKING } from "../../../src/lib/studio/contracts";

export const STUDIO_EDIT_DEFAULT_MODEL = "gpt-6-luna";
export const STUDIO_EDIT_DEFAULT_THINKING = "high";

export function pickStudioModel(o: { env: NodeJS.ProcessEnv; hasVideo: boolean }): { model: string; thinking: string; edit: boolean } {
  const model = o.env.STUDIO_AGENT_MODEL?.trim() || STUDIO_DEFAULT_MODEL;
  const thinking = o.env.STUDIO_AGENT_THINKING?.trim() || STUDIO_DEFAULT_THINKING;
  const editModel = o.env.STUDIO_EDIT_MODEL?.trim() || STUDIO_EDIT_DEFAULT_MODEL;
  if (!o.hasVideo || editModel === "same") return { model, thinking, edit: false };
  return { model: editModel, thinking: o.env.STUDIO_EDIT_THINKING?.trim() || STUDIO_EDIT_DEFAULT_THINKING, edit: true };
}
