import type { Metadata } from "next";
import { ApiKeysPanel } from "./api-keys-panel";

export const metadata: Metadata = { title: "Ozzy for agents", robots: { index: false, follow: false } };

export default function ApiPage() {
  return <ApiKeysPanel />;
}
