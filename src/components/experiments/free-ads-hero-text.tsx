"use client";

import { useExperiment } from "./use-experiment";

/** /free-ads is static and CDN-cached, so the variant is resolved on the client. Control copy renders first and is swapped only for a served variant with a payload. */
export function FreeAdsHeroText({ headline, sub, h1Id, h1ClassName, subClassName }: { headline: string; sub: string; h1Id: string; h1ClassName: string; subClassName: string }) {
  const { variant } = useExperiment("free_ads_headline_effort");
  const p = variant?.payload;
  return (
    <>
      <h1 id={h1Id} className={h1ClassName}>{p?.headline ?? headline}</h1>
      <p className={subClassName}>{p?.sub ?? sub}</p>
    </>
  );
}
