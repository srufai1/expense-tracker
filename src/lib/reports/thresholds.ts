// Every number the suggestion rules use (DESIGN §7.4), in one place, so
// changing "30%" is a one-line change. Amounts are pesewas.

// The report shows at most this many suggestions.
export const MAX_SUGGESTIONS = 5;

// S-2: near budget — at least 90% used, with at least 5 days of the month left.
export const NEAR_BUDGET_PERCENT = 90;
export const NEAR_BUDGET_MIN_DAYS_LEFT = 5;

// S-3: spending jump — at least 30% and at least GHS 50 above the average.
export const JUMP_PERCENT = 30;
export const JUMP_MIN_MINOR = 5_000;

// S-4: fees adding up — GHS 20 or more, or 5 or more fee items, in a week.
export const FEES_MIN_MINOR = 2_000;
export const FEES_MIN_COUNT = 5;

// S-6: good week — spending at most 90% of the average.
export const GOOD_PERIOD_PERCENT = 90;

// S-7: saving opportunity — at least 50% of income kept.
export const SAVING_OPPORTUNITY_PERCENT = 50;

// S-8: missing days — nothing recorded on 3 or more days of the week.
export const MISSING_DAYS_MIN = 3;

// S-5: a goal's recent average is over the last 4 weeks.
export const GOAL_RECENT_WEEKS = 4;
