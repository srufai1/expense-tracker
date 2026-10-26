import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatMoney } from "@/lib/money";
import type { PayStatus } from "@/lib/school/fees";
import { cn } from "@/lib/utils";

// Small display pieces shared by the School money pages.

export const ghs = (minor: number) => formatMoney(minor, "GHS");

export function Panel({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4", className)}>
      {children}
    </section>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{children}</h2>;
}

// Two or three numbers side by side at the top of a page.
export function Tiles({ items }: { items: { label: string; minor: number; tone?: "warn" }[] }) {
  return (
    <div className={cn("grid gap-2", items.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {items.map((item) => (
        <div key={item.label} className={cn("rounded-xl bg-muted/60 px-3 py-2", item.tone === "warn" && "bg-amber-100 dark:bg-amber-950/50")}>
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="text-base font-extrabold tabular-nums">{ghs(item.minor)}</div>
        </div>
      ))}
    </div>
  );
}

export function MoneyRow({ label, minor, sign, strong = false }: { label: ReactNode; minor: number; sign?: "+" | "−"; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={cn("min-w-0 break-words", strong ? "font-bold" : "text-muted-foreground")}>{label}</span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          strong && "font-bold",
          sign === "+" && "text-emerald-700 dark:text-emerald-400",
          sign === "−" && "text-destructive",
        )}
      >
        {sign ? `${sign} ` : ""}
        {ghs(minor)}
      </span>
    </div>
  );
}

// A row that opens another page.
export function LinkRow({ href, title, detail, right }: { href: string; title: ReactNode; detail?: ReactNode; right?: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold break-words">{title}</span>
        {detail ? <span className="text-xs break-words text-muted-foreground">{detail}</span> : null}
      </span>
      {right ? <span className="flex shrink-0 flex-col items-end gap-1 text-sm">{right}</span> : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone: "ok" | "warn" | "bad" | "plain" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap",
        tone === "ok" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        tone === "warn" && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
        tone === "bad" && "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
        tone === "plain" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

// "Paid ✓", "Bal. 50.00", "Free"…
export function StatusPill({ status }: { status: PayStatus }) {
  switch (status.kind) {
    case "free":
      return <Pill tone="plain">Free</Pill>;
    case "paid":
      return <Pill tone="ok">Paid ✓</Pill>;
    case "over":
      return <Pill tone="ok">Paid ✓ +{ghs(status.extraMinor).replace("GHS ", "")}</Pill>;
    case "unpaid":
      return <Pill tone="bad">Bal. {ghs(status.balanceMinor).replace("GHS ", "")}</Pill>;
    case "part":
      return <Pill tone="warn">Bal. {ghs(status.balanceMinor).replace("GHS ", "")}</Pill>;
  }
}

export function statusDetail(status: PayStatus, paidMinor: number): string {
  switch (status.kind) {
    case "free":
      return "Full discount";
    case "unpaid":
      return "Not paid";
    case "part":
      return `Advance ${ghs(status.advanceMinor)}`;
    default:
      return ghs(paidMinor);
  }
}

// Filter buttons kept in the address (?show=…), so Back keeps them.
export function FilterLinks({ base, current, options }: { base: string; current: string; options: { value: string; label: string }[] }) {
  return (
    <nav aria-label="Show" className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Link
          key={option.value}
          href={option.value === "all" ? base : `${base}?show=${option.value}`}
          aria-current={current === option.value ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold",
            current === option.value ? "border-primary bg-primary text-primary-foreground" : "bg-card",
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
