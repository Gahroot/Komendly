"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { ozzy } from "@/components/ozzy/store";

/** Ozzy on the auth pages. Signals the signup gate only when a real pending run is waiting. */
export function AdsAuthOzzy() {
  const params = useSearchParams();
  const pending = (params.get("next") ?? "").startsWith("/ads/start");
  useEffect(() => {
    ozzy.emit(pending ? { type: "auth:signup-gate" } : { type: "page:landing" });
  }, [pending]);
  return <OzzyLazy size={140} perch="ground" interactive label="Ozzy. Click to say hi." />;
}
