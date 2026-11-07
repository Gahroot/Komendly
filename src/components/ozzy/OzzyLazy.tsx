"use client";

import dynamic from "next/dynamic";
import type { OzzyProps } from "./Ozzy";
import { OzzyBoundary } from "./ozzy-boundary";

const OzzyClient = dynamic<OzzyProps>(() => import("./Ozzy").then((m) => m.Ozzy), {
  ssr: false,
  loading: () => null,
});

/** Client-only Ozzy inside a same-size box, so nothing shifts while it loads. */
export function OzzyLazy(props: OzzyProps) {
  const size = props.size ?? 96;
  return (
    <span className="relative inline-block align-bottom" style={{ width: size, height: size }}>
      <OzzyBoundary><OzzyClient {...props} size={size} /></OzzyBoundary>
    </span>
  );
}
