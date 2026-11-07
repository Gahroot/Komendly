"use client";

import { createContext, useContext, useMemo, useState } from "react";

/** The page-wide "spell" state: lets the sky, constellation and moon react to the URL field. */
export type Spell = "idle" | "typing" | "valid" | "invalid" | "cast";

const SpellCtx = createContext<{ spell: Spell; setSpell: (s: Spell) => void }>({ spell: "idle", setSpell: () => undefined });

export function useSpell() {
  return useContext(SpellCtx);
}

export function StudioRoot({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [spell, setSpell] = useState<Spell>("idle");
  const value = useMemo(() => ({ spell, setSpell }), [spell]);
  return (
    <SpellCtx.Provider value={value}>
      <div className={`studio dark ${className}`} data-spell={spell}>
        {children}
      </div>
    </SpellCtx.Provider>
  );
}
