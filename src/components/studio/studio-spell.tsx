"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fraunces } from "./fonts";

/** The page-wide "spell" state: lets the sky, constellation and moon react to the URL field. */
export type Spell = "idle" | "typing" | "valid" | "invalid" | "cast";

const SpellCtx = createContext<{ spell: Spell; setSpell: (s: Spell) => void }>({ spell: "idle", setSpell: () => undefined });

export function useSpell() {
  return useContext(SpellCtx);
}

// Dialogs, sheets, menus and toasts are portaled to <body>, outside this wrapper. Give <body> the studio
// tokens while a studio page is mounted so every overlay matches.
const BODY_CLASSES = ["studio", "studio-body", "dark", fraunces.variable];

export function StudioRoot({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [spell, setSpell] = useState<Spell>("idle");
  const value = useMemo(() => ({ spell, setSpell }), [spell]);
  useEffect(() => {
    document.body.classList.add(...BODY_CLASSES);
    return () => document.body.classList.remove(...BODY_CLASSES);
  }, []);
  return (
    <SpellCtx.Provider value={value}>
      <div className={`studio dark ${fraunces.variable} ${className}`} data-spell={spell}>
        {children}
      </div>
    </SpellCtx.Provider>
  );
}
