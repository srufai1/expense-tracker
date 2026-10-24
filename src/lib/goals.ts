import { z } from "zod";

import { isIsoDate } from "./dates";
import { isStillUsed } from "./db-errors";
import { parseAmount } from "./money";

// Savings goals (DESIGN §6.7, D-24). A goal is a label: the money stays in
// its account, and a contribution changes no balance and no spending total.

function toMinor(text: string, context: z.RefinementCtx, allowNegative = false): number {
  const result = parseAmount(text, { allowNegative });
  if (!result.ok) {
    context.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }
  return result.minor;
}

function firstErrors<F extends string>(issues: z.core.$ZodIssue[]): Partial<Record<F, string>> {
  const errors: Partial<Record<F, string>> = {};
  for (const issue of issues) errors[issue.path[0] as F] ??= issue.message;
  return errors;
}

const text = (raw: Record<string, unknown>, keys: readonly string[]) =>
  Object.fromEntries(keys.map((key) => [key, typeof raw[key] === "string" ? raw[key] : ""]));

export type GoalFormErrors = Partial<Record<"name" | "target" | "targetDate", string>>;

const goalSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60, "Use 60 characters or fewer."),
  target: z.string().transform((value, context) => toMinor(value, context)),
  targetDate: z.string().refine(isIsoDate, "Enter a real date."),
});

export function parseGoalForm(
  raw: Record<string, unknown>,
): { ok: true; value: { name: string; targetMinor: number; targetDate: string } } | { ok: false; errors: GoalFormErrors } {
  const result = goalSchema.safeParse(text(raw, ["name", "target", "targetDate"]));
  if (!result.success) return { ok: false, errors: firstErrors(result.error.issues) };
  return { ok: true, value: { name: result.data.name, targetMinor: result.data.target, targetDate: result.data.targetDate } };
}

export type ContributionFormErrors = Partial<Record<"amount" | "occurredOn" | "note", string>>;

const contributionSchema = z.object({
  // Negative: money taken back out of the goal. Never 0.
  amount: z.string().transform((value, context) => toMinor(value, context, true)),
  occurredOn: z.string().refine(isIsoDate, "Enter a real date."),
  note: z.string().trim().max(200, "Use 200 characters or fewer."),
});

export function parseContributionForm(
  raw: Record<string, unknown>,
):
  | { ok: true; value: { amountMinor: number; occurredOn: string; note: string } }
  | { ok: false; errors: ContributionFormErrors } {
  const result = contributionSchema.safeParse(text(raw, ["amount", "occurredOn", "note"]));
  if (!result.success) return { ok: false, errors: firstErrors(result.error.issues) };
  return { ok: true, value: { amountMinor: result.data.amount, occurredOn: result.data.occurredOn, note: result.data.note } };
}

// Saved so far (the sum of the contributions), and the bar's fill: 0–100%.
export function goalProgress(contributions: number[], targetMinor: number): { savedMinor: number; percent: number } {
  const savedMinor = contributions.reduce((sum, amount) => sum + amount, 0);
  const percent = Math.min(100, Math.max(0, Math.round((savedMinor * 1000) / targetMinor) / 10));
  return { savedMinor, percent };
}

export function goalSaveError(code: string | undefined): GoalFormErrors | null {
  return code === "23505" ? { name: "You already have a goal with this name." } : null;
}

export function goalDeleteError(code: string | undefined): string {
  return isStillUsed(code)
    ? "This goal has contributions or a recurring item, so it cannot be deleted. Archive it instead: it is hidden, and its history stays."
    : "Check your internet connection and try again.";
}

// The goals a recurring item can add to (D-40): active goals by name, and an
// archived one only when the item already uses it.
export function goalChoices(
  goals: { id: string; name: string; archived: boolean }[],
  keepId?: string,
): { id: string; name: string }[] {
  return goals
    .filter((goal) => !goal.archived || goal.id === keepId)
    .map((goal) => ({ id: goal.id, name: goal.archived ? `${goal.name} (archived)` : goal.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
