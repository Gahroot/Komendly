"use client";

import { useState } from "react";
import { Save, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Settings</h1>
        <p className="text-zinc-400 mt-1">Configure platform settings</p>
      </div>

      {/* Platform Settings */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100">Platform Configuration</CardTitle>
          <CardDescription className="text-zinc-500">
            General platform settings and limits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="starter-minutes" className="text-zinc-300">
                Starter Plan Minutes
              </Label>
              <Input
                id="starter-minutes"
                type="number"
                defaultValue={3}
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pro-minutes" className="text-zinc-300">
                Pro Plan Minutes
              </Label>
              <Input
                id="pro-minutes"
                type="number"
                defaultValue={20}
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="enterprise-minutes" className="text-zinc-300">
                Enterprise Plan Minutes
              </Label>
              <Input
                id="enterprise-minutes"
                type="number"
                defaultValue={60}
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-video-duration" className="text-zinc-300">
                Max Video Duration (seconds)
              </Label>
              <Input
                id="max-video-duration"
                type="number"
                defaultValue={120}
                className="bg-zinc-800 border-zinc-700 text-zinc-100"
              />
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-zinc-900 border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-zinc-500">
            Destructive actions that cannot be undone
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
            <div>
              <p className="font-medium text-zinc-100">Clear Failed Videos</p>
              <p className="text-sm text-zinc-500">
                Remove all videos with failed status from the database
              </p>
            </div>
            <Button
              variant="outline"
              className="border-red-600 text-red-400 hover:bg-red-600/20"
            >
              Clear Failed
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
            <div>
              <p className="font-medium text-zinc-100">Reset Usage Counters</p>
              <p className="text-sm text-zinc-500">
                Reset all user usage counters to zero
              </p>
            </div>
            <Button
              variant="outline"
              className="border-red-600 text-red-400 hover:bg-red-600/20"
            >
              Reset Usage
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
