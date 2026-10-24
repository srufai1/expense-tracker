import { formatMoney, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

// An amount on screen: tabular digits so columns line up, and red when
// negative (D-29).
export function MoneyText({
  minor,
  currency,
  className,
}: {
  minor: number;
  currency: Currency;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", minor < 0 && "text-destructive", className)}>
      {formatMoney(minor, currency)}
    </span>
  );
}
