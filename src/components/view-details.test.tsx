import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ViewDetails } from "./view-details";

describe("ViewDetails", () => {
  it("starts closed, behind a 'View details' link", () => {
    const html = renderToStaticMarkup(<ViewDetails>Old reports still show them.</ViewDetails>);
    expect(html).toMatch(/^<details/);
    expect(html).not.toContain(" open");
    expect(html).toContain("<summary");
    expect(html).toContain("View details");
    expect(html).toContain("Old reports still show them.");
  });

  it("keeps the id on the explanation, for aria-describedby", () => {
    const html = renderToStaticMarkup(
      <ViewDetails id="rate-hint" label="How is this worked out?">
        From the rate.
      </ViewDetails>,
    );
    expect(html).toContain('id="rate-hint"');
    expect(html).toContain("How is this worked out?");
  });
});
