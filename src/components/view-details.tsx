import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// "View details" (D-53): explanations stay out of the way until asked for,
// so each screen shows its numbers and buttons first. Built on the
// browser's own <details>, so it needs no JavaScript and works with the
// keyboard and screen readers. Numbers, warnings and empty-page messages
// are not put in here: they must always show.
//
// `id` goes on the explanation, so a field can still point to it with
// aria-describedby (screen readers read it even while it is closed).
export function ViewDetails({
  children,
  id,
  label = "View details",
  className,
}: {
  children: ReactNode;
  id?: string;
  label?: string;
  className?: string;
}) {
  return (
    <details className={cn("group text-sm", className)}>
      <summary className="-my-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md font-semibold text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div id={id} className="mt-1 rounded-xl bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
