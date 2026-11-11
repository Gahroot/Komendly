"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { OzzyProps } from "./Ozzy";
import { OzzyBoundary } from "./ozzy-boundary";

const OzzyClient = dynamic<OzzyProps>(() => import("./Ozzy").then((m) => m.Ozzy), {
  ssr: false,
  loading: () => null,
});

// Ozzy is drawn on the CPU every frame, so on phones he competed with the headline for the main thread
// (Lighthouse mobile: LCP 7.5s, TBT 620ms on /free-ads). Mount him once the page has loaded and gone idle,
// or on the visitor's first interaction, whichever comes first. The box keeps its size, so nothing shifts.
let pageReady = false;
function whenPageIdle(cb: () => void): () => void {
  if (pageReady) { cb(); return () => undefined; }
  let done = false;
  let idle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    if (done) return;
    done = true;
    pageReady = true;
    cleanup();
    cb();
  };
  const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
  const afterLoad = () => {
    const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) idle = ric(fire, { timeout: 2500 });
    else timer = setTimeout(fire, 1200);
  };
  function cleanup() {
    window.removeEventListener("load", afterLoad);
    for (const e of events) window.removeEventListener(e, fire);
    if (idle !== undefined) (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(idle);
    if (timer) clearTimeout(timer);
  }
  for (const e of events) window.addEventListener(e, fire, { once: true, passive: true });
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
  return () => { done = true; cleanup(); };
}

/** Client-only Ozzy inside a same-size box, mounted after the page is idle so nothing shifts or stalls while it loads. */
export function OzzyLazy(props: OzzyProps) {
  const size = props.size ?? 96;
  const [show, setShow] = useState(pageReady);
  useEffect(() => (show ? undefined : whenPageIdle(() => setShow(true))), [show]);
  return (
    <span className="relative inline-block align-bottom" style={{ width: size, height: size }}>
      {show ? <OzzyBoundary><OzzyClient {...props} size={size} /></OzzyBoundary> : null}
    </span>
  );
}
