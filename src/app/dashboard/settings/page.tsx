"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { User, Mail, Loader2, Check, AlertCircle } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { PageHeader } from "@/components/page-header";
import { FIRST_VIDEO_OFFER } from "@/lib/first-video-offer";

export default function SettingsPage() {
  const { user, isLoading: userLoading, refresh } = useUser();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user?.name]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/auth/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      setSuccess(true);
      refresh();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 aria-hidden className="h-8 w-8 animate-spin text-[var(--studio-gold)]" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader eyebrow="Account" title="Settings" description="Your name and account details." />

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-[oklch(0.7_0.17_25/0.5)] bg-[oklch(0.7_0.17_25/0.12)] p-3 text-sm text-[oklch(0.86_0.1_25)]">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-[oklch(0.84_0.14_78/0.45)] bg-[oklch(0.84_0.14_78/0.1)] p-3 text-sm text-[var(--studio-gold)]">
          <Check className="h-5 w-5 flex-shrink-0" />
          <span>Profile updated successfully</span>
        </div>
      )}

      <Card >
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <User aria-hidden className="h-5 w-5 text-[var(--studio-gold)]" />
            Profile Information
          </CardTitle>
          <CardDescription>Update your account details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ""}
                  disabled
                  className="h-11 pl-10 text-muted-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-muted-foreground">
                Name
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="h-11 pl-10"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={saving || name === user?.name}
              className="spellbar__cta h-11 rounded-xl px-5 font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card >
        <CardHeader>
          <CardTitle className="text-foreground">Account Information</CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Plan</span>
            <span className="text-foreground font-semibold capitalize">
              {user?.subscriptionStatus === "active" ? user.plan : (user?.bonusMinutes ?? 0) > 0 ? FIRST_VIDEO_OFFER.name : "None"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Account Status</span>
            <span
              className={`font-semibold ${
                user?.subscriptionStatus === "active"
                  ? "text-[var(--success)]"
                  : "text-muted-foreground"
              }`}
            >
              {user?.subscriptionStatus || "Inactive"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Member Since</span>
            <span className="text-foreground">
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : "-"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
