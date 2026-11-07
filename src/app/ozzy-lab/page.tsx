import type { Metadata } from "next";
import { OzzyLabClient } from "./ozzy-lab-client";

export const metadata: Metadata = {
  title: "Ozzy Lab",
  robots: { index: false, follow: false },
};

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function OzzyLabPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  return <OzzyLabClient form={one(q.form)} expr={one(q.expr)} />;
}
