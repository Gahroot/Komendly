import raw from "../../../../docs/ops/obligations.json";
import { parseObligations } from "./obligations";
export const OBLIGATIONS = parseObligations(raw);
