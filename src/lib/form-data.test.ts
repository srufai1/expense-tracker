import { describe, expect, it } from "vitest";

import { formValues } from "./form-data";

describe("formValues", () => {
  it("keeps the text fields the user filled in", () => {
    const data = new FormData();
    data.set("name", "Cash");
    data.set("openingBalance", "12.50");
    expect(formValues(data)).toEqual({ name: "Cash", openingBalance: "12.50" });
  });

  it("drops Next.js internal fields and files", () => {
    const data = new FormData();
    data.set("name", "Cash");
    data.set("$ACTION_ID_abc", "");
    data.set("receipt", new Blob(["x"]), "photo.jpg");
    expect(formValues(data)).toEqual({ name: "Cash" });
  });
});
