// Browser helper, no UI imports: the cold-traffic landing form uses it without pulling in the dialog.

/** Ask the server whether this website already used its free pack. Fails open (false) on any error or after 2.5 s. */
export async function checkTrialDomain(url: string): Promise<{ used: boolean; domain: string | null }> {
  try {
    const res = await fetch("/api/ads/trial-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { used: false, domain: null };
    const d = (await res.json()) as { used?: boolean; domain?: string | null };
    return { used: d.used === true, domain: d.domain ?? null };
  } catch {
    return { used: false, domain: null };
  }
}
