import { describe, expect, it } from "vitest";

import { goalChoices, goalDeleteError, goalProgress, goalSaveError, parseContributionForm, parseGoalForm } from "./goals";

describe("parseGoalForm", () => {
  it("reads a name, a GHS target and a target date", () => {
    expect(parseGoalForm({ name: " New laptop ", target: "8,000", targetDate: "2027-03-31" })).toEqual({
      ok: true,
      value: { name: "New laptop", targetMinor: 800_000, targetDate: "2027-03-31" },
    });
  });

  it("gives one message per wrong field", () => {
    expect(parseGoalForm({ name: "", target: "0", targetDate: "2027-02-30" })).toEqual({
      ok: false,
      errors: {
        name: "Enter a name.",
        target: "The amount must be more than 0.",
        targetDate: "Enter a real date.",
      },
    });
  });
});

describe("parseContributionForm (D-24)", () => {
  it("reads money put in, or taken out with a minus sign", () => {
    expect(parseContributionForm({ amount: "180", occurredOn: "2026-10-26", note: "" })).toEqual({
      ok: true,
      value: { amountMinor: 18_000, occurredOn: "2026-10-26", note: "" },
    });
    expect(parseContributionForm({ amount: "-50.50", occurredOn: "2026-10-26", note: " Repair " })).toMatchObject({
      ok: true,
      value: { amountMinor: -5_050, note: "Repair" },
    });
  });

  it("refuses 0, a wrong date and a long note", () => {
    expect(parseContributionForm({ amount: "0", occurredOn: "x", note: "n".repeat(201) })).toEqual({
      ok: false,
      errors: {
        amount: "The amount must be more than 0.",
        occurredOn: "Enter a real date.",
        note: "Use 200 characters or fewer.",
      },
    });
  });
});

describe("goalProgress", () => {
  it("adds the contributions, and caps the bar at 100%", () => {
    expect(goalProgress([50_000, -10_000, 20_000], 800_000)).toEqual({ savedMinor: 60_000, percent: 7.5 });
    expect(goalProgress([900_000], 800_000)).toEqual({ savedMinor: 900_000, percent: 100 });
    expect(goalProgress([-1_000], 800_000)).toEqual({ savedMinor: -1_000, percent: 0 });
    expect(goalProgress([], 800_000)).toEqual({ savedMinor: 0, percent: 0 });
  });
});

describe("goal errors", () => {
  it("explains a duplicate name and a goal that is in use", () => {
    expect(goalSaveError("23505")).toEqual({ name: "You already have a goal with this name." });
    expect(goalSaveError(undefined)).toBeNull();
    expect(goalDeleteError("23001")).toBe(
      "This goal has contributions or a recurring item, so it cannot be deleted. Archive it instead: it is hidden, and its history stays.",
    );
    expect(goalDeleteError("23503")).toContain("Archive it instead");
    expect(goalDeleteError(undefined)).toBe("Check your internet connection and try again.");
  });
});

describe("goalChoices", () => {
  it("lists active goals by name, plus an archived one the item already uses", () => {
    const goals = [
      { id: "b", name: "Trip", archived: false },
      { id: "a", name: "Car", archived: false },
      { id: "c", name: "Old phone", archived: true },
    ];
    expect(goalChoices(goals)).toEqual([
      { id: "a", name: "Car" },
      { id: "b", name: "Trip" },
    ]);
    expect(goalChoices(goals, "c").map((goal) => goal.name)).toEqual(["Car", "Old phone (archived)", "Trip"]);
  });
});
