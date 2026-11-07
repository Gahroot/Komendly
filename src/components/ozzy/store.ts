"use client";

import { useEffect } from "react";
import { createStore, useStore } from "zustand";
import { INITIAL_OZZY, ozzyReducer, ozzySettle } from "./machine";
import type { OzzyEvent, OzzyEventType, OzzyState } from "./types";

export const OZZY_IDLE_MS = 20_000;
const MOTION_MS = 1800;
const LINE_MS = 4500;

interface OzzyStore {
  state: OzzyState;
  emit: (event: OzzyEvent) => void;
  reset: () => void;
}

function createOzzyStore() {
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let motionTimer: ReturnType<typeof setTimeout> | undefined;
  let lineTimer: ReturnType<typeof setTimeout> | undefined;

  return createStore<OzzyStore>()((set, get) => {
    const armIdle = () => {
      if (typeof window === "undefined") return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => get().emit({ type: "idle" }), OZZY_IDLE_MS);
    };

    return {
      state: INITIAL_OZZY,
      emit: (event) => {
        const prev = get().state;
        // Any real event while asleep wakes him first.
        const next = ozzyReducer(prev, event);
        set({ state: next });
        if (event.type !== "idle") armIdle();
        if (typeof window === "undefined") return;
        clearTimeout(motionTimer);
        if (next.motion !== "idle" && next.motion !== "sleep" && next.motion !== "type" && next.motion !== "scan") {
          motionTimer = setTimeout(() => set({ state: ozzySettle(get().state) }), MOTION_MS);
        }
        if (next.line) {
          clearTimeout(lineTimer);
          const line = next.line;
          lineTimer = setTimeout(() => {
            const cur = get().state;
            if (cur.line === line) set({ state: { ...cur, line: undefined } });
          }, LINE_MS);
        }
      },
      reset: () => {
        clearTimeout(idleTimer);
        clearTimeout(motionTimer);
        clearTimeout(lineTimer);
        set({ state: INITIAL_OZZY });
        armIdle();
      },
    };
  });
}

export const ozzyStore = createOzzyStore();

/** Singleton API usable from any client component or handler. */
export const ozzy = {
  emit: (event: OzzyEvent) => ozzyStore.getState().emit(event),
  getState: () => ozzyStore.getState().state,
  subscribe: (fn: (s: OzzyState) => void) => ozzyStore.subscribe((s) => fn(s.state)),
};

export function useOzzyState(): OzzyState {
  return useStore(ozzyStore, (s) => s.state);
}

/**
 * Emit an event once on mount (and again whenever `deps` change).
 * Example: useOzzyEvent({ type: "page:landing" });
 */
export function useOzzyEvent(event: OzzyEvent | null, deps: readonly unknown[] = []): void {
  const key: OzzyEventType | "none" = event?.type ?? "none";
  useEffect(() => {
    if (event) ozzy.emit(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
}
