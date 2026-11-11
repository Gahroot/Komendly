import { redirect } from "next/navigation";

/** Alias from the brief (/ads/gift/new?admin=1). */
export default async function GiftNewAlias({ searchParams }: { searchParams: Promise<{ admin?: string }> }) {
  const { admin } = await searchParams;
  redirect(admin ? "/ads/gifts/new?admin=1" : "/ads/gifts/new");
}
