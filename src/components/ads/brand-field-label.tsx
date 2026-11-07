import { PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

/** Field label with an "Edited by you" marker when the user has corrected it. */
export function BrandFieldLabel({ htmlFor, children, edited, help }: { htmlFor?: string; children: React.ReactNode; edited: boolean; help?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {htmlFor ? <Label htmlFor={htmlFor}>{children}</Label> : <span className="text-sm font-medium">{children}</span>}
        {edited && (
          <Badge variant="outline" className="gap-1 rounded-full text-xs font-normal text-muted-foreground">
            <PencilLine className="size-3" aria-hidden /> Edited by you
          </Badge>
        )}
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}
