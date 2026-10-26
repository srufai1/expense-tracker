import "server-only";

import { revalidatePath } from "next/cache";

import { todayInAccra } from "@/lib/dates";

export const CHECK_CONNECTION = "Check your internet connection and try again.";

// School money changes the account balance (Home, Accounts) and, for the
// developer's own share, the income in Activity and Reports: refresh all.
export function refreshAll() {
  revalidatePath("/", "layout");
}

export function today(): string {
  return todayInAccra();
}

// The database's messages, in plain words. Anything else: a connection
// problem (the database has already refused anything invalid).
export function schoolError(error: { message: string } | null | undefined): string {
  const message = error?.message ?? "";
  const known: [RegExp, string][] = [
    [/set up School money first/, "Set up School money first (choose where you keep the money)."],
    [/this week is settled/, "This week is already settled. Undo the settlement first to change its days."],
    [/day cannot be in the future|date cannot be in the future/, "The date cannot be in the future."],
    [/do not add up/, "The numbers changed while you were settling. Open the week again and settle once more."],
    [/no class this week/, "There was no class this week, so there is nothing to share."],
    [/duplicate key value.*mc_weeks/, "This week is already settled."],
    [/more than the fund has/, "That is more than the fund has."],
    [/savings from this week were already used/, "This week's savings were already used. Remove that spending from the savings fund first."],
    [/teachers' part of this book was already used/, "The teachers' part of this book was already spent from the book fund. Remove that spending first."],
    [/bought after this date were already given out/, "Books bought after this date were already given out. Use the date of your latest purchase or later."],
    [/paid for books already given out/, "This money paid for books already given out, so it stays."],
    [/more than you are holding/, "That is more than you are holding for this fee."],
    [/already handed over/, "This money was already handed over, so the payment cannot be removed."],
    [/school_fee_payments_fee_student_id_fkey/, "This student has payments, so they stay on the fee. Remove the payments first."],
    [/no (.+) books left/, "There are no books of that subject left. Record the books you bought first."],
    [/not paid for these books/, "The student has not paid for these books yet."],
    [/already given out/, "That book was already given out."],
    [/only the last book/, "Only the last book given out of a subject can be undone."],
    [/does not cover its cost/, "The price does not cover the book's cost and transport. Raise the price first."],
    [/some of these books were given out/, "Some of these books were given out, so this purchase stays."],
    [/this book was given out/, "This book was given out. Undo that first."],
    [/duplicate key value.*school_students/, "A student with this name is already in that class."],
    [/duplicate key value.*school_fees/, "You already have a fee with this name."],
    [/duplicate key value.*book_subjects/, "You already have this subject."],
    [/duplicate key value.*mc_sharers/, "This name is already on the list."],
  ];
  return known.find(([pattern]) => pattern.test(message))?.[1] ?? CHECK_CONNECTION;
}
