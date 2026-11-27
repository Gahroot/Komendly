// Static import of the owner-editable JSON (bundled by Next and tsx alike; no fs path to trace on Vercel).
import raw from "../../../../docs/ops/fixed-costs.json";
import { parseFixedItems } from "./fixed-costs";
export const FIXED_ITEMS = parseFixedItems(raw);
