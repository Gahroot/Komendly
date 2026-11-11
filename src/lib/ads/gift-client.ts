// Browser-side gift helpers (no server imports).
import type { GiftQuota, GiftView } from "./gifts";

export interface GiftListResponse {
  gifts: GiftView[];
  quota: GiftQuota;
  senderName: string;
  emailVerified: boolean;
}

export type { GiftView, GiftQuota };

export function giftLink(token: string): string {
  return `${window.location.origin}/gift/${token}`;
}

/** Same copy as gifts.ts giftShareText (kept client-side to avoid importing server code). */
export function giftMessage(g: Pick<GiftView, "senderName" | "recipientName" | "businessName">, link: string): { subject: string; text: string } {
  const hi = g.recipientName ? `Hi ${g.recipientName}, ` : "Hi! ";
  return {
    subject: `I made you 3 ads for ${g.businessName}`,
    text: `${hi}I had Ozzy at Komendly make 3 Facebook & Instagram ads for ${g.businessName}, on me. Have a look: ${link}\n\n${g.senderName}`,
  };
}

export function postGiftShared(id: string, channel: string): void {
  void fetch(`/api/ads/gifts/${id}/shared`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel }), keepalive: true }).catch(() => undefined);
}
