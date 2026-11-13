"use client";

import { useState } from "react";
import { Save, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // Placeholder for settings save
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Settings" description="Plan limits and platform switches for the testimonial app." />

      {/* Platform Settings */}
      <Card >
        <CardHeader>
          <CardTitle className="text-foreground">Platform Configuration</CardTitle>
          <CardDescription className="text-muted-foreground">
            General platform settings and limits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="starter-minutes" className="text-foreground/80">
                Starter Plan Minutes
              </Label>
              <Input
                id="starter-minutes"
                type="number"
                defaultValue={3}
                className="bg-secondary border-input text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pro-minutes" className="text-foreground/80">
                Pro Plan Minutes
              </Label>
              <Input
                id="pro-minutes"
                type="number"
                defaultValue={20}
                className="bg-secondary border-input text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="enterprise-minutes" className="text-foreground/80">
                Enterprise Plan Minutes
              </Label>
              <Input
                id="enterprise-minutes"
                type="number"
                defaultValue={60}
                className="bg-secondary border-input text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-video-duration" className="text-foreground/80">
                Max Video Duration (seconds)
              </Label>
              <Input
                id="max-video-duration"
                type="number"
                defaultValue={120}
                className="bg-secondary border-input text-foreground"
              />
            </div>
          </div>

          <Separator className="bg-secondary" />

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-foreground"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-card border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Destructive actions that cannot be undone
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-input">
            <div>
              <p className="font-medium text-foreground">Clear Failed Videos</p>
              <p className="text-sm text-muted-foreground">
                Remove all videos with failed status from the database
              </p>
            </div>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/20"
            >
              Clear Failed
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-input">
            <div>
              <p className="font-medium text-foreground">Reset Usage Counters</p>
              <p className="text-sm text-muted-foreground">
                Reset all user usage counters to zero
              </p>
            </div>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/20"
            >
              Reset Usage
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
