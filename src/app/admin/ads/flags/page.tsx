import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { PostActionButton } from "../_components/post-action-button";

export const dynamic = "force-dynamic";

const FLAGS = [
  { key: "ezmotion", label: "EZ Motion", description: "Animated (motion) ad generation." },
  { key: "meta_publish", label: "Meta publishing", description: "Let paid workspaces publish ads to Meta." },
  { key: "lifecycle_email", label: "Lifecycle emails", description: "Engine sends the post-sign-up / post-trial email sequence (preview at Admin > Emails)." },
] as const;

export default async function AdminAdsFlagsPage() {
  const rows = await prisma.adsFeatureFlag.findMany();
  const enabled = new Map(rows.map((r) => [r.key, r.enabled]));
  return (
    <AdminAdsShell title="Feature flags" description="Global switches read by the app and the engine.">
      <div className="grid gap-4 md:grid-cols-2">
        {FLAGS.map((f) => {
          const on = enabled.get(f.key) ?? false;
          return (
            <Card key={f.key}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">{f.label}<Badge variant={on ? "default" : "secondary"}>{on ? "on" : "off"}</Badge></CardTitle>
                <CardDescription>{f.description} <span className="font-mono">({f.key})</span></CardDescription>
              </CardHeader>
              <CardContent>
                <PostActionButton url="/api/admin/ads/flags" body={{ key: f.key, enabled: !on }} label={on ? "Turn off" : "Turn on"} variant={on ? "outline" : "default"}
                  confirm={{ title: `${on ? "Disable" : "Enable"} ${f.label}?`, description: "This takes effect for every workspace immediately." }} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AdminAdsShell>
  );
}
