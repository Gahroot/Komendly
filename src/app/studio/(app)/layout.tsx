import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Signed-in only: /studio and /studio/<id>. (The invite landing sits outside this group and stays public.) */
export default async function StudioAppLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) redirect("/ads/login?next=/studio");
  return children;
}
