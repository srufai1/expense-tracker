import { describe, expect, it } from "vitest";

import { checkPhotoType, checkShrunkSize, MAX_RECEIPT_BYTES, receiptPath, scaledSize } from "./receipts";

describe("receiptPath (§6.9)", () => {
  it("is {user_id}/{transaction_id}.jpg", () => {
    expect(receiptPath("u-1", "t-2")).toBe("u-1/t-2.jpg");
  });
});

describe("scaledSize", () => {
  it("shrinks the longer side to 1600 px and keeps the shape", () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(scaledSize(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(scaledSize(4000, 1)).toEqual({ width: 1600, height: 1 });
  });

  it("never makes a small photo bigger", () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("photo checks", () => {
  it("accepts images only", () => {
    expect(checkPhotoType("image/jpeg")).toBeNull();
    expect(checkPhotoType("image/heic")).toBeNull();
    expect(checkPhotoType("application/pdf")).toBe("Choose a photo (for example JPEG or PNG).");
    expect(checkPhotoType("")).toBe("Choose a photo (for example JPEG or PNG).");
  });

  it("refuses a shrunk photo over 5 MB", () => {
    expect(checkShrunkSize(MAX_RECEIPT_BYTES)).toBeNull();
    expect(checkShrunkSize(MAX_RECEIPT_BYTES + 1)).toBe("This photo is still over 5 MB after shrinking. Try another photo.");
  });
});
