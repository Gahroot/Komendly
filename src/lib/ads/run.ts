import crypto from "crypto";
import type { NextRequest } from "next/server";
import type { RequestFingerprint } from "./abuse";
import { CREDIT_COST, type Awareness, type Ratio } from "./contracts";

export const DEVICE_COOKIE = "ads_device";
export const PRIORITY = { paid: 10, trial: 0 } as const;

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function fingerprintFrom(request: NextRequest): RequestFingerprint {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || request.headers.get("x-real-ip") || null,
    deviceId: request.cookies.get(DEVICE_COOKIE)?.value ?? null,
    userAgent: request.headers.get("user-agent"),
  };
}

export function creditCost(input: { staticCount: number; ratios: readonly Ratio[]; motionCount: number }): number {
  return input.staticCount * input.ratios.length * CREDIT_COST.staticPerRatio + input.motionCount * CREDIT_COST.motion;
}

/** Spread `count` ads evenly over the chosen awareness levels (deterministic, input order). */
export function awarenessMixFor(levels: readonly Awareness[], count: number): Partial<Record<Awareness, number>> {
  const mix: Partial<Record<Awareness, number>> = {};
  levels.forEach((level, i) => {
    const share = Math.floor(count / levels.length) + (i < count % levels.length ? 1 : 0);
    if (share > 0) mix[level] = share;
  });
  return mix;
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function domainOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}
