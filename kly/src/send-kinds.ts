// OutboundSend.kind values that matter to the cold-sending caps and health checks (no imports: safe everywhere).
//  - sequence:     the cold sequence (step 1, step 2).
//  - hot_followup: the one follow-up to a lead who really looked at their gift ad (hot-followup.ts).
//  - reply:        Kly's answer to a prospect who wrote to us (never counted against the caps).
export const SEQUENCE_KIND = "sequence";
export const HOT_FOLLOWUP_KIND = "hot_followup";
/** Sends that use up a mailbox's and a domain's daily cap, and whose bounces/complaints count against their health. */
export const CAPPED_KINDS: string[] = [SEQUENCE_KIND, HOT_FOLLOWUP_KIND];
