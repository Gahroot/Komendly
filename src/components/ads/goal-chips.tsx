"use client";

import { Button } from "@/components/ui/button";
import { AD_GOALS, type AdGoalValue } from "@/lib/ads/contracts";
import { GOAL_LABELS } from "@/lib/ads/run-labels";

export function GoalChips({ value, onChange }: { value: AdGoalValue; onChange: (goal: AdGoalValue) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ads goal">
      {AD_GOALS.map((goal) => (
        <Button
          key={goal}
          type="button"
          size="sm"
          role="radio"
          aria-checked={value === goal}
          variant={value === goal ? "default" : "outline"}
          className="rounded-full"
          onClick={() => onChange(goal)}
        >
          {goal === "auto" ? "Auto" : GOAL_LABELS[goal]}
        </Button>
      ))}
    </div>
  );
}
