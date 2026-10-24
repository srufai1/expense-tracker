import "server-only";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type Goal = {
  id: string;
  name: string;
  targetMinor: number;
  targetDate: string;
  archived: boolean;
  contributions: { id: string; occurredOn: string; amountMinor: number; note: string }[];
};

const COLUMNS =
  "id, name, target_minor, target_date, archived_at, goal_contributions(id, occurred_on, amount_minor, note)";

type Row = {
  id: string;
  name: string;
  target_minor: number;
  target_date: string;
  archived_at: string | null;
  goal_contributions: { id: string; occurred_on: string; amount_minor: number; note: string }[];
};

function toGoal(row: Row): Goal {
  return {
    id: row.id,
    name: row.name,
    targetMinor: row.target_minor,
    targetDate: row.target_date,
    archived: row.archived_at !== null,
    contributions: row.goal_contributions
      .map((c) => ({ id: c.id, occurredOn: c.occurred_on, amountMinor: c.amount_minor, note: c.note }))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1)),
  };
}

// The user's goals with their contributions, soonest target first.
export async function getGoals(): Promise<Goal[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("goals").select(COLUMNS).order("target_date");
  if (error) throw new Error(`Could not load goals: ${error.message}`);
  return (data as unknown as Row[]).map(toGoal);
}

export async function getGoal(id: string): Promise<Goal | null> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("goals").select(COLUMNS).eq("id", id).maybeSingle();
  // 22P02: the id in the address is not a valid uuid — treat as "not found".
  if (error && error.code !== "22P02") throw new Error(`Could not load the goal: ${error.message}`);
  return data ? toGoal(data as unknown as Row) : null;
}
