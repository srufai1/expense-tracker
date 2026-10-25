import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NativeSelect } from "./native-select";

describe("NativeSelect", () => {
  it("gives the open list's rows the theme's colours, so dark mode is readable on Windows", () => {
    // Chrome on Windows draws the open list on white unless the <option>
    // rows have their own background. In dark mode the text is near-white,
    // so without these the rows were white on white.
    const html = renderToStaticMarkup(
      <NativeSelect>
        <option>Cash</option>
      </NativeSelect>,
    );
    expect(html).toContain("[&amp;_option]:bg-popover");
    expect(html).toContain("[&amp;_option]:text-popover-foreground");
  });
});
