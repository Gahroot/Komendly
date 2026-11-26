// Creative hubs, server side. Storage = AdsEvent only (see creative-hubs.ts). Flags (default OFF): creative_hubs (intake, votes,
// approve links), creative_outreach (the one nominee email), creative_publish (public showcase / makeovers / business of the day).
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { appBaseUrl, sendAdsMail } from "@/lib/ads/mailer";
import { webText } from "@/lib/ads/auto-reply-server";
import { DEFAULT_POSTAL_ADDRESS } from "@/lib/ads/outbound/copy";
import { renderLifecycleHtml, renderLifecycleText, unsubscribeHeaders } from "@/lib/ads/lifecycle/template";
import { signEmailToken } from "@/lib/ads/lifecycle/tokens";
import { reviewGate } from "@/lib/growth/review-gate";
import { systemEnabled, withSystemUtm } from "@/lib/growth/systems";
import { hashIp } from "@/lib/growth/free-tools-server";
import {
  GIVEAWAY_EVENT, HUB_EVENT, HUB_EVENTS, NOMINEE_FACTS, buildNomineeEmail, challengeMs, checkNonprofit, domainOf, isShowcaseSlug, latestShowcases, parseHubInput, parsePairId, pickBusinessOfTheDay,
  signHubToken, slugify, tally, verifyHubToken, type HubKind, type ShowcaseRow,
} from "@/lib/growth/creative-hubs";

export const hubsEnabled = () => systemEnabled(prisma, "creative_hubs");
export const outreachEnabled = () => systemEnabled(prisma, "creative_outreach");
export const publishEnabled = () => systemEnabled(prisma, "creative_publish");
const secret = () => process.env.LIFECYCLE_EMAIL_SECRET ?? "";
const postal = () => process.env.OUTBOUND_POSTAL_ADDRESS || DEFAULT_POSTAL_ADDRESS;
export const BASE = () => appBaseUrl("https://www.komendly.com");

/** Giveaway is open only when GIVEAWAY_PRIZE (plain-text prize) is set; the key rolls monthly. */
export function currentGiveaway(now = new Date()): { key: string; prize: string } | null {
  const prize = (process.env.GIVEAWAY_PRIZE ?? "").trim();
  return prize ? { key: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`, prize: prize.slice(0, 200) } : null;
}

type R = { ok: true; message?: string } | { ok: false; status: number; error: string };
const off: R = { ok: false, status: 503, error: "This isn't open yet. Please check back soon." };
const tooMany: R = { ok: false, status: 429, error: "Too many requests. Please try again later." };

export async function isOptedOut(email: string): Promise<boolean> {
  return Boolean(await prisma.adsEvent.findFirst({ where: { name: HUB_EVENTS.optout, props: { path: ["email"], equals: email.toLowerCase() } }, select: { id: true } }));
}

export async function submitHub(kind: HubKind, raw: unknown, o: { ip: string; origin: string; userId?: string | null }): Promise<R> {
  if (!(await hubsEnabled())) return off;
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (body.hp) return { ok: true }; // honeypot: pretend success
  const parsed = parseHubInput(kind, body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const d = parsed.data;
  const email = String(d.email ?? d.nomineeEmail ?? "");
  if (!(await rateLimit(`hub_ip:${o.ip}`, 8, 3600)) || (email && !(await rateLimit(`hub_${kind}_email:${email}`, 3, 86_400)))) return tooMany;
  const props: Record<string, unknown> = { system: "creative_hubs", kind, status: "received", ipHash: hashIp(o.ip), ...d, consentAt: new Date().toISOString() };
  let name: string = HUB_EVENT;
  if (kind === "giveaway") {
    const g = currentGiveaway();
    if (!g) return { ok: false, status: 409, error: "There's no giveaway running right now." };
    if (await prisma.adsEvent.findFirst({ where: { name: GIVEAWAY_EVENT, AND: [{ props: { path: ["giveaway"], equals: g.key } }, { props: { path: ["email"], equals: email } }] }, select: { id: true } })) return { ok: true, message: "You're already entered. One entry per person." };
    name = GIVEAWAY_EVENT; props.giveaway = g.key; props.prize = g.prize;
  }
  if (kind === "reaction") { props.consent = { publish: d.publishConsent === true, at: props.consentAt, text: "v1: may publish quote with shown name" }; props.published = false; }
  if (kind === "nonprofit") { const c = checkNonprofit({ ein: String(d.ein), email, url: String(d.url) }); props.verification = c; props.status = c.status; }
  if (kind === "takedown") {
    name = HUB_EVENTS.takedown;
    await prisma.adsEvent.create({ data: { name: HUB_EVENTS.optout, props: { email, via: "takedown_form" } } });
  }
  const ev = await prisma.adsEvent.create({ data: { name, userId: o.userId ?? null, props: props as never } });
  if (kind === "nominate") await maybeSendNomineeEmail(ev.id, d, o.origin).catch((e) => console.error("[hubs] nominee email failed", e));
  return { ok: true };
}

/** The one honest "someone nominated you" email. Never when: flag off, no public email, opted out, already sent, gate says no. */
async function maybeSendNomineeEmail(subId: string, d: Record<string, string | boolean>, origin: string) {
  const to = typeof d.nomineeEmail === "string" ? d.nomineeEmail : "";
  if (!to || !secret() || !(await outreachEnabled())) return;
  if (await isOptedOut(to)) return;
  if (await prisma.adsEvent.findFirst({ where: { name: HUB_EVENTS.nomineeEmail, props: { path: ["to"], equals: to } }, select: { id: true } })) return;
  const base = appBaseUrl(origin);
  const optOutUrl = `${base}/api/hub/optout?t=${signHubToken({ a: "optout", e: to }, secret())}`;
  const mail = buildNomineeEmail({ businessName: String(d.businessName), siteUrl: String(d.url), optOutUrl, freeUrl: withSystemUtm(`${base}/free-ads`, "creative_outreach", { campaign: "nominate" }), postal: postal(), nominatorName: typeof d.nominatorName === "string" ? d.nominatorName : undefined });
  const gate = await reviewGate(webText, { system: "creative_outreach", kind: "email", itemKey: `nominee:${subId}`, content: `${mail.subject}\n\n${mail.text}`, facts: NOMINEE_FACTS, extraRules: ["Must carry a working opt-out link and the postal address.", "May say someone nominated the business; must not publish or claim anything else about it."] });
  await prisma.adsEvent.create({ data: { name: "review_gate", props: { system: "creative_outreach", kind: "email", itemKey: `nominee:${subId}`, approved: gate.approved, reasons: gate.verdict.reasons, attempt: 1 } } }).catch(() => {});
  if (!gate.approved) return;
  await prisma.adsEvent.create({ data: { name: HUB_EVENTS.nomineeEmail, props: { to, subId } } }); // record first: fail closed (never twice)
  const html = `<div style="font-family:sans-serif;white-space:pre-wrap;max-width:560px">${mail.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`;
  await sendAdsMail({ to, subject: mail.subject, text: mail.text, html, headers: unsubscribeHeaders(optOutUrl) });
}

export async function applyOptOut(token: string): Promise<boolean> {
  const p = verifyHubToken(token, secret());
  if (!p || p.a !== "optout" || typeof p.e !== "string") return false;
  const email = p.e.toLowerCase();
  if (!(await isOptedOut(email))) await prisma.adsEvent.create({ data: { name: HUB_EVENTS.optout, props: { email, via: "link" } } });
  return true;
}

// ---- Votes ----
export async function castVote(pair: string, choice: string, ip: string): Promise<R> {
  if (!(await hubsEnabled())) return off;
  const ids = parsePairId(pair);
  if (!ids || !ids.includes(choice)) return { ok: false, status: 400, error: "Invalid vote." };
  if (!(await rateLimit(`vote_ip:${ip}`, 40, 86_400)) || !(await rateLimit(`vote:${hashIp(ip)}:${pair}`, 1, 86_400))) return { ok: false, status: 429, error: "You've already voted on this one today." };
  await prisma.adsEvent.create({ data: { name: HUB_EVENTS.vote, props: { pair, choice, ipHash: hashIp(ip) } } }); // no PII: only a salted hash for the rate limit
  return { ok: true };
}
export async function pairTally(pair: string) {
  const ids = parsePairId(pair);
  if (!ids) return null;
  const rows = await prisma.adsEvent.findMany({ where: { name: HUB_EVENTS.vote, props: { path: ["pair"], equals: pair } }, select: { props: true }, take: 20000 });
  return tally(rows.map((r) => ({ choice: String((r.props as { choice?: unknown })?.choice ?? "") })), ids[0], ids[1]);
}

// ---- Challenge ----
export async function startChallenge(ip: string): Promise<{ token: string } | null> {
  if (!(await hubsEnabled()) || !(await rateLimit(`chal_start:${ip}`, 30, 3600))) return null;
  return { token: signHubToken({ a: "chal", s: Date.now() }, secret()) };
}
export async function finishChallenge(token: string, claimedMs: number, siteDomain: string, ip: string): Promise<{ id: string; ms: number } | null> {
  const p = verifyHubToken(token, secret());
  if (!p || p.a !== "chal" || typeof p.s !== "number" || !(await rateLimit(`chal_end:${ip}`, 30, 3600))) return null;
  const now = Date.now();
  if (now - p.s > 10 * 60_000) return null;
  if (await prisma.adsEvent.findFirst({ where: { name: HUB_EVENTS.challenge, props: { path: ["start"], equals: p.s } }, select: { id: true } })) return null; // one result per start token
  const ms = challengeMs(p.s, now, claimedMs);
  const ev = await prisma.adsEvent.create({ data: { name: HUB_EVENTS.challenge, props: { ms, start: p.s, domain: siteDomain.slice(0, 80) } } });
  return { id: ev.id, ms };
}
export async function challengeResult(id: string) {
  const ev = await prisma.adsEvent.findUnique({ where: { id } });
  if (!ev || ev.name !== HUB_EVENTS.challenge) return null;
  return { ms: Number((ev.props as { ms?: unknown }).ms ?? 0), at: ev.createdAt };
}

// ---- Ads of a run (public via a capability ref) ----
export async function readyAds(runId: string, onlyIds?: string[]) {
  const ads = await prisma.ad.findMany({ where: { ...(onlyIds ? { id: { in: onlyIds } } : { runId }), status: "ready" }, orderBy: [{ runId: "asc" }, { index: "asc" }], take: 12, select: { id: true, headline: true, body: true, cta: true, assets: { select: { id: true, mime: true, ratio: true, width: true, height: true, expiresAt: true } } } });
  return ads.flatMap((a) => {
    const asset = a.assets.find((x) => x.mime.startsWith("image/") && x.ratio === "1:1") ?? a.assets.find((x) => x.mime.startsWith("image/"));
    return asset ? [{ id: a.id, headline: a.headline, body: a.body, cta: a.cta, assetId: asset.id, width: asset.width, height: asset.height }] : [];
  });
}

/** Resolves an image ref ("a.<token>" approve, "s.<slug>" showcase, "m.<eventId>" makeover) to the ad ids it may show. */
export async function adIdsForRef(ref: string): Promise<string[] | null> {
  const [kind, ...rest] = ref.split("."); const key = rest.join(".");
  if (kind === "a") { const p = verifyHubToken(key, secret()); if (!p || p.a !== "approve" || typeof p.r !== "string") return null; return (await prisma.ad.findMany({ where: { runId: p.r, status: "ready" }, select: { id: true } })).map((a) => a.id); }
  if (kind === "s") { if (!(await publishEnabled())) return null; const s = await showcaseBySlug(key); return s ? s.adIds : null; }
  if (kind === "m") { const m = await publicMakeover(key); return m ? (await prisma.ad.findMany({ where: { runId: m.runId, status: "ready" }, select: { id: true } })).map((a) => a.id) : null; }
  return null;
}

// ---- Approve links (83) ----
export async function createApproveLink(userId: string, runId: string, origin: string): Promise<string | null> {
  const run = await prisma.adRun.findFirst({ where: { id: runId, userId }, select: { id: true } });
  if (!run || !secret()) return null;
  const x = Math.floor(Date.now() / 1000) + 60 * 86_400;
  return `${appBaseUrl(origin)}/approve/${signHubToken({ a: "approve", r: run.id, x }, secret())}`;
}
export async function approvePack(token: string) {
  const p = verifyHubToken(token, secret());
  if (!p || p.a !== "approve" || typeof p.r !== "string") return null;
  const run = await prisma.adRun.findUnique({ where: { id: p.r }, select: { id: true, userId: true, brandProfile: { select: { name: true } } } }).catch(() => null);
  if (!run) return null;
  const [ads, last] = await Promise.all([readyAds(run.id), prisma.adsEvent.findFirst({ where: { name: HUB_EVENTS.approval, runId: run.id }, orderBy: { createdAt: "desc" }, select: { props: true, createdAt: true } })]);
  return { runId: run.id, brand: run.brandProfile?.name ?? "this business", ads, last: last ? { action: String((last.props as { action?: unknown }).action), at: last.createdAt } : null };
}
export async function submitApproval(token: string, i: { action: unknown; note: unknown; name: unknown }, ip: string, origin: string): Promise<R> {
  if (!(await hubsEnabled())) return off;
  const pack = await approvePack(token);
  if (!pack) return { ok: false, status: 404, error: "This link isn't valid any more." };
  const action = i.action === "approve" ? "approve" : i.action === "changes" ? "changes" : null;
  if (!action) return { ok: false, status: 400, error: "Choose approve or request changes." };
  const note = typeof i.note === "string" ? i.note.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 500) : "";
  const name = typeof i.name === "string" ? i.name.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 60) : "";
  if (action === "changes" && !note) return { ok: false, status: 400, error: "Tell us what to change." };
  if (!(await rateLimit(`approve_ip:${ip}`, 10, 3600)) || !(await rateLimit(`approve_run:${pack.runId}`, 30, 86_400))) return tooMany;
  await prisma.adsEvent.create({ data: { name: HUB_EVENTS.approval, runId: pack.runId, props: { action, note, name } } });
  const owner = await prisma.user.findUnique({ where: { id: (await prisma.adRun.findUnique({ where: { id: pack.runId }, select: { userId: true } }))!.userId }, select: { id: true, email: true } });
  const opted = owner ? await prisma.adsEvent.findFirst({ where: { name: "email_unsubscribed", userId: owner.id }, select: { id: true } }) : null;
  if (owner?.email && !opted && secret()) {
    const base = appBaseUrl(origin);
    const unsub = `${base}/api/ads/email-unsubscribe?t=${signEmailToken({ p: "unsub", u: owner.id }, secret())}`;
    const who = name || "Someone with your approve link";
    const input = { appUrl: base, subject: action === "approve" ? `${who} approved your ads` : `${who} asked for changes to your ads`, preheader: note || "See the response", paragraphs: [action === "approve" ? `${who} approved the ad pack for ${pack.brand}.` : `${who} asked for changes to the ad pack for ${pack.brand}:`, ...(note ? [`"${note}"`] : [])], cta: { label: "Open the ads", href: `${base}/ads/runs/${pack.runId}` }, unsubscribeUrl: unsub };
    await sendAdsMail({ to: owner.email, subject: input.subject, text: renderLifecycleText(input), html: renderLifecycleHtml(input), headers: unsubscribeHeaders(unsub) }).catch((e) => console.error("[approve] notify failed", e));
  }
  return { ok: true };
}

// ---- Showcase / business of the day ----
const asRow = (e: { createdAt: Date; props: unknown }): (ShowcaseRow & { title: string; blurb: string; adIds: string[]; workspaceId: string }) => {
  const p = e.props as Record<string, unknown>;
  return { slug: String(p.slug ?? ""), enabled: p.enabled === true, botd: p.botd === true, createdAt: e.createdAt, title: String(p.title ?? ""), blurb: String(p.blurb ?? ""), adIds: Array.isArray(p.adIds) ? p.adIds.map(String) : [], workspaceId: String(p.workspaceId ?? "") };
};
export async function listShowcases() {
  const rows = await prisma.adsEvent.findMany({ where: { name: HUB_EVENTS.showcase }, orderBy: { createdAt: "asc" }, take: 2000 });
  return latestShowcases(rows.map(asRow));
}
export async function showcaseBySlug(slug: string) {
  if (!isShowcaseSlug(slug)) return null;
  const e = await prisma.adsEvent.findFirst({ where: { name: HUB_EVENTS.showcase, props: { path: ["slug"], equals: slug } }, orderBy: { createdAt: "desc" } });
  const r = e ? asRow(e) : null;
  return r && r.enabled ? r : null;
}
export async function mineShowcase(workspaceId: string) {
  const e = await prisma.adsEvent.findFirst({ where: { name: HUB_EVENTS.showcase, workspaceId }, orderBy: { createdAt: "desc" } });
  return e ? asRow(e) : null;
}
/** Owner opt-in/out. Only the owner's own ready ads; slug unique to the workspace. Disabling hides it immediately. */
export async function saveShowcase(userId: string, workspaceId: string, i: { title: unknown; blurb: unknown; adIds: unknown; enabled: unknown; botd: unknown }): Promise<R & { slug?: string }> {
  const prev = await mineShowcase(workspaceId);
  const title = typeof i.title === "string" ? i.title.trim().slice(0, 80) : "";
  const blurb = typeof i.blurb === "string" ? i.blurb.trim().slice(0, 300) : "";
  const slug = prev?.slug || slugify(title);
  if (i.enabled === true && (!title || !isShowcaseSlug(slug))) return { ok: false, status: 400, error: "Add a business name." };
  const ids = Array.isArray(i.adIds) ? i.adIds.map(String).slice(0, 12) : [];
  const owned = ids.length ? await prisma.ad.findMany({ where: { id: { in: ids }, workspaceId, status: "ready" }, select: { id: true } }) : [];
  if (i.enabled === true && !owned.length) return { ok: false, status: 400, error: "Pick at least one of your finished ads." };
  if (!prev) { const taken = await prisma.adsEvent.findFirst({ where: { name: HUB_EVENTS.showcase, props: { path: ["slug"], equals: slug } }, select: { id: true } }); if (taken) return { ok: false, status: 409, error: "That name is taken. Try another." }; }
  await prisma.adsEvent.create({ data: { name: HUB_EVENTS.showcase, userId, workspaceId, props: { slug, title: title || prev?.title || "", blurb, adIds: owned.map((a) => a.id), enabled: i.enabled === true, botd: i.enabled === true && i.botd === true, consentAt: new Date().toISOString(), workspaceId } } });
  return { ok: true, slug };
}

/** Daily: pick one opted-in business once per UTC day; blurb is templated, gated, and only the owner's own words. */
export async function runBusinessOfTheDay(now = new Date()): Promise<string> {
  if (!(await publishEnabled())) return "flag off";
  const day = now.toISOString().slice(0, 10);
  if (await prisma.adsEvent.findFirst({ where: { name: HUB_EVENTS.botd, props: { path: ["day"], equals: day } }, select: { id: true } })) return "already picked";
  const [rows, picks] = await Promise.all([listShowcases(), prisma.adsEvent.findMany({ where: { name: HUB_EVENTS.botd }, select: { props: true, createdAt: true }, take: 400 })]);
  const pick = pickBusinessOfTheDay(rows, picks.map((p) => ({ slug: String((p.props as { slug?: unknown }).slug), at: p.createdAt })), now);
  if (!pick) return "no opted-in business";
  const blurb = `${pick.title} opted in to be Ozzy's business of the day. These are the ads they chose to share.${pick.blurb ? ` In their words: "${pick.blurb}"` : ""}`;
  const gate = await reviewGate(webText, { system: "creative_publish", kind: "page", itemKey: `botd:${day}:${pick.slug}`, content: blurb, facts: `Business: ${pick.title}. Opted in via the showcase toggle. Owner's own words: ${pick.blurb || "(none)"}.` });
  await prisma.adsEvent.create({ data: { name: "review_gate", props: { system: "creative_publish", kind: "page", itemKey: `botd:${day}:${pick.slug}`, approved: gate.approved, reasons: gate.verdict.reasons, attempt: 1 } } }).catch(() => {});
  if (!gate.approved) return "review gate blocked";
  await prisma.adsEvent.create({ data: { name: HUB_EVENTS.botd, props: { slug: pick.slug, day, blurb } } });
  return `picked ${pick.slug}`;
}
export async function latestBotd(limit = 14) {
  const rows = await prisma.adsEvent.findMany({ where: { name: HUB_EVENTS.botd }, orderBy: { createdAt: "desc" }, take: limit });
  const shows = new Map((await listShowcases()).map((s) => [s.slug, s]));
  return rows.flatMap((r) => { const p = r.props as { slug?: string; day?: string; blurb?: string }; const s = p.slug ? shows.get(p.slug) : undefined; return s ? [{ slug: s.slug, title: s.title, day: String(p.day), blurb: String(p.blurb ?? "") }] : []; });
}

// ---- Public makeover (32): admin-created, only with a claimed gift or the business's own public source ----
export async function publishMakeover(adminUserId: string, i: { businessName: string; siteUrl: string; runId: string; basis: "claimed" | "own_public"; giftToken?: string; sourceUrl?: string; caption?: string }): Promise<R & { id?: string }> {
  if (!(await publishEnabled())) return off;
  const site = domainOf(i.siteUrl);
  if (!site || !i.businessName.trim()) return { ok: false, status: 400, error: "Business name and its website are required." };
  if (i.basis === "claimed") {
    const g = i.giftToken ? await prisma.adsGift.findUnique({ where: { token: i.giftToken }, select: { claimedAt: true, recipientUrl: true, runId: true } }) : null;
    if (!g?.claimedAt || domainOf(g.recipientUrl) !== site) return { ok: false, status: 400, error: "That gift isn't claimed by this business." };
  } else if (!i.sourceUrl || domainOf(i.sourceUrl) !== site) return { ok: false, status: 400, error: "Own-public makeovers need a source URL on the business's own domain." };
  if (!(await prisma.adRun.findUnique({ where: { id: i.runId }, select: { id: true } }))) return { ok: false, status: 400, error: "Unknown run." };
  const caption = (i.caption ?? "").trim().slice(0, 400);
  if (caption) {
    const gate = await reviewGate(webText, { system: "creative_publish", kind: "page", itemKey: `makeover:${site}`, content: caption, facts: `Business: ${i.businessName}. Source: ${i.sourceUrl ?? "claimed gift"}.`, extraRules: ["Must stay respectful about the business; no claims about its performance."] });
    if (!gate.approved) return { ok: false, status: 422, error: `Review gate blocked the caption: ${gate.verdict.reasons.join("; ")}` };
  }
  const ev = await prisma.adsEvent.create({ data: { name: HUB_EVENTS.makeoverPublic, userId: adminUserId, runId: i.runId, props: { businessName: i.businessName.trim().slice(0, 120), siteUrl: i.siteUrl, site, runId: i.runId, basis: i.basis, sourceUrl: i.sourceUrl ?? null, caption } } });
  return { ok: true, id: ev.id };
}
export async function publicMakeover(id: string) {
  if (!(await publishEnabled())) return null;
  const ev = await prisma.adsEvent.findUnique({ where: { id } }).catch(() => null);
  if (!ev || ev.name !== HUB_EVENTS.makeoverPublic) return null;
  const p = ev.props as { businessName: string; siteUrl: string; site: string; runId: string; basis: string; sourceUrl: string | null; caption: string };
  const down = await prisma.adsEvent.findFirst({ where: { name: HUB_EVENTS.takedown, OR: [{ props: { path: ["ref"], string_contains: id } }, { props: { path: ["ref"], string_contains: p.site } }] }, select: { id: true } });
  return down ? null : { id, ...p };
}

// ---- 100 businesses in 100 days: real counts from AdsGift only ----
export async function progressCounts() {
  const where = { source: { in: ["outbound", "admin_outreach"] } };
  const [first, made, delivered, viewed, claimed] = await Promise.all([
    prisma.adsGift.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.adsGift.count({ where: { ...where, status: { not: "failed" } } }),
    prisma.adsGift.count({ where: { ...where, status: "ready" } }),
    prisma.adsGift.count({ where: { ...where, status: "ready", viewedAt: { not: null } } }),
    prisma.adsGift.count({ where: { ...where, status: "ready", claimedAt: { not: null } } }),
  ]);
  return { startedAt: first?.createdAt ?? null, counts: { made, delivered, viewed, claimed } };
}
