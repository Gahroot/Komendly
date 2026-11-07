import { cookies } from "next/headers";
import { ANON_ID_COOKIE, EXP_COOKIE, completeAssignments, parseAssignments, type Assignments, type ExperimentKey } from "./experiments";

/** Variant assignments for this request (middleware guarantees the cookies on page requests). */
export async function getAssignments(): Promise<Assignments> {
  const jar = await cookies();
  const anonId = jar.get(ANON_ID_COOKIE)?.value ?? "anon";
  return completeAssignments(anonId, parseAssignments(jar.get(EXP_COOKIE)?.value));
}

export async function getVariant(key: ExperimentKey): Promise<string> {
  return (await getAssignments())[key] ?? "control";
}
