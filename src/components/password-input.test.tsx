import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("starts hidden, with a 'Show password' button beside it", () => {
    const html = renderToStaticMarkup(<PasswordInput id="password" name="password" autoComplete="current-password" />);
    expect(html).toContain('type="password"');
    expect(html).toContain('name="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain('aria-controls="password"');
  });
});
