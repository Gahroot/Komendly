"use client";

import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import type { OzzyExpression, OzzyForm, OzzyMotion } from "@/components/ozzy/types";

/** A pinned, decorative Ozzy pose (not tied to app state), for illustrating a step. */
export function StudioPose({ form, expression = "neutral", motion = "idle", size = 96 }: { form: OzzyForm; expression?: OzzyExpression; motion?: OzzyMotion; size?: number }) {
  return <OzzyLazy size={size} perch="ground" speech={false} pose={{ form, expression, motion }} />;
}
