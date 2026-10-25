import { describe, expect, it } from "vitest";

import { AVATAR_SIDE, avatarPath, squareCrop } from "./avatar";

describe("profile photo (D-50)", () => {
  it("is saved as one small square JPEG per user", () => {
    expect(AVATAR_SIDE).toBe(256);
    expect(avatarPath("u-1")).toBe("u-1/avatar.jpg");
  });

  it("crops the middle square of a photo, whatever its shape", () => {
    expect(squareCrop(4032, 3024)).toEqual({ x: 504, y: 0, side: 3024 }); // landscape
    expect(squareCrop(3024, 4032)).toEqual({ x: 0, y: 504, side: 3024 }); // portrait
    expect(squareCrop(500, 500)).toEqual({ x: 0, y: 0, side: 500 });
    expect(squareCrop(301, 200)).toEqual({ x: 50, y: 0, side: 200 }); // rounds down
  });
});
