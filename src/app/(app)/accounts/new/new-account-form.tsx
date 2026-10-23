import { requireUser } from "@/lib/auth";
import { todayInAccra } from "@/lib/dates";

import { AccountForm } from "../account-form";
import { createAccount } from "../actions";

export async function NewAccountForm() {
  // requireUser() also makes this render per request, so "today" is
  // always the real date, not the date of the build.
  await requireUser();
  const today = todayInAccra();
  return (
    <AccountForm
      action={createAccount}
      submitLabel="Add account"
      today={today}
      initial={{
        name: "",
        type: "cash",
        currency: "GHS",
        openingBalance: "",
        openingBalanceOn: today,
      }}
    />
  );
}
