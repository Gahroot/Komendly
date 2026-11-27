// Server-side admin gate for EVERY /admin/** page (S-16). The client layout still
// does its UX redirect, but nothing under /admin renders for a non-admin.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdminClientLayout } from "./admin-client-layout";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/dashboard");
  return <AdminClientLayout>{children}</AdminClientLayout>;
}
