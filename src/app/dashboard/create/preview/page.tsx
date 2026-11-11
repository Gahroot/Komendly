import { redirect } from "next/navigation";

/** The old text-to-video flow is retired; /dashboard/create-fal is the single create flow. */
export default function LegacyCreateRedirect() {
  redirect("/dashboard/create-fal");
}
