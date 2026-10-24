import { CreditCard, Landmark, Smartphone, Wallet, type LucideProps } from "lucide-react";

import type { AccountType } from "@/lib/accounts";

const ICONS = {
  cash: Wallet,
  bank: Landmark,
  mobile_money: Smartphone,
  card: CreditCard,
} as const;

export function AccountTypeIcon({ type, ...props }: { type: AccountType } & LucideProps) {
  const Icon = ICONS[type] ?? Wallet;
  return <Icon aria-hidden="true" {...props} />;
}
