import { describe, expect, it } from "vitest";

import type { CategoryRow } from "../categories";
import { buildReport, type ReportTransaction } from "../reports/build";
import { periodFor } from "../reports/periods";
import { escapeHtml, weeklyEmail, weeklyRecipients } from "./weekly";

const cat = (values: Partial<CategoryRow> & { id: string; name: string }): CategoryRow => ({
  kind: "expense",
  parentId: null,
  systemKey: null,
  sortOrder: 0,
  archived: false,
  ...values,
});
const CATEGORIES = [
  cat({ id: "food", name: "Food & <Drinks>", sortOrder: 1 }),
  cat({ id: "data", name: "Data", sortOrder: 2 }),
  cat({ id: "sal", name: "Salary", kind: "income" }),
];
const tx = (id: string, occurredOn: string, kind: ReportTransaction["kind"], categoryId: string, amount: number) => ({
  id,
  occurredOn,
  kind,
  categoryId,
  amountGhsMinor: amount,
  note: "",
});
const META = { title: "19 – 25 Oct 2026", appName: "Expense Tracker" };

describe("escapeHtml", () => {
  it("makes user text safe inside HTML", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;");
  });
});

describe("weeklyEmail (screen 9)", () => {
  const report = buildReport({
    period: periodFor("week", "2026-10-19"),
    today: "2026-10-26",
    transactions: [
      tx("a", "2026-10-20", "expense", "food", 20_000),
      tx("b", "2026-10-21", "expense", "data", 9_000),
      tx("c", "2026-10-23", "income", "sal", 50_000),
    ],
    categories: CATEGORIES,
    budgets: [
      { categoryId: "food", effectiveFrom: "2026-10-01", amountMinor: 15_000 },
      { categoryId: "data", effectiveFrom: "2026-10-01", amountMinor: 10_000 },
    ],
    // Behind (S-5), so there are 4 suggestions and the email shows 3.
    goals: [{ id: "g", name: "Trip", targetMinor: 100_000, targetDate: "2026-12-31", archived: false, contributions: [] }],
    historyStartsOn: "2026-10-01",
  });
  const email = weeklyEmail(report, META);

  it("has a subject with the week", () => {
    expect(email.subject).toBe("Your week: 19 – 25 Oct 2026");
  });

  it("has the summary, budget alerts and at most 3 suggestions, in plain text", () => {
    expect(email.text).toBe(
      [
        "Your week: 19 – 25 Oct 2026",
        "",
        "Spent: GHS 290.00",
        "Income: GHS 500.00",
        "Net: GHS 210.00",
        "Saved: 42%",
        "",
        "Budgets (October 2026):",
        "- Food & <Drinks>: over budget, GHS 200.00 of GHS 150.00",
        "- Data: 90% used, GHS 90.00 of GHS 100.00",
        "",
        "Suggestions:",
        ...report.suggestions.slice(0, 3).map((s) => `- ${s}`),
        "",
        "The full report is attached as a PDF.",
        "",
        "Sent by Expense Tracker. You can turn this email off in Settings → Weekly email.",
      ].join("\n"),
    );
    expect(report.suggestions.length).toBeGreaterThan(3);
  });

  it("puts the same content in the HTML, with user text escaped", () => {
    expect(email.html).toContain("Food &amp; &lt;Drinks&gt;");
    expect(email.html).not.toContain("<Drinks>");
    expect(email.html).toContain("GHS 290.00");
    expect(email.html).toContain("over budget");
    expect(email.html).toContain("attached as a PDF");
    expect(email.html.match(/<li/g)?.length).toBe(2 + 3); // 2 budget alerts + 3 suggestions
  });

  it("is still sent for an empty week, saying so (D-27)", () => {
    const empty = buildReport({
      period: periodFor("week", "2026-10-19"),
      today: "2026-10-26",
      transactions: [],
      categories: CATEGORIES,
      budgets: [],
      goals: [],
      historyStartsOn: null,
    });
    const quiet = weeklyEmail(empty, META);
    expect(quiet.subject).toBe("Your week: 19 – 25 Oct 2026 · nothing recorded");
    expect(quiet.text).toContain("Nothing recorded this week.");
    expect(quiet.text).not.toContain("Spent:");
    expect(quiet.text).not.toContain("Budgets");
    expect(quiet.text).not.toContain("Suggestions");
    expect(quiet.html).toContain("Nothing recorded this week.");
  });
});

describe("weeklyRecipients", () => {
  it("is every user with an email address, the weekly email on (the default), and the week not yet sent", () => {
    const users = [
      { id: "a", email: "a@example.com" },
      { id: "b", email: "b@example.com" },
      { id: "c", email: "c@example.com" },
      { id: "d", email: null },
      { id: "e", email: "e@example.com" },
    ];
    expect(
      weeklyRecipients(
        users,
        [
          { userId: "b", weeklyEmail: false },
          { userId: "c", weeklyEmail: true },
        ],
        [
          { userId: "c", status: "sent" },
          { userId: "e", status: "failed" },
          // Claimed by a run that did not finish: it may have been sent, so
          // it is never sent again automatically.
          { userId: "a", status: "sending" },
        ],
      ),
    ).toEqual([
      // A failed week is tried again.
      { id: "e", email: "e@example.com" },
    ]);
  });
});
