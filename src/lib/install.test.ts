import { describe, expect, it } from "vitest";

import { installMode, isIos } from "./install";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

describe("isIos", () => {
  it("knows an iPhone, and an iPad that says it is a Mac (it has a touch screen)", () => {
    expect(isIos(IPHONE, 5)).toBe(true);
    expect(isIos(IPAD_DESKTOP_MODE, 5)).toBe(true);
    expect(isIos(IPAD_DESKTOP_MODE, 0)).toBe(false); // a real Mac
    expect(isIos(ANDROID, 5)).toBe(false);
    expect(isIos(WINDOWS, 0)).toBe(false);
  });
});

describe("installMode", () => {
  it("hides the button once the app is installed (opened from the home screen)", () => {
    expect(installMode({ standalone: true, canPrompt: true, ios: false })).toBe("hidden");
    expect(installMode({ standalone: true, canPrompt: false, ios: true })).toBe("hidden");
  });

  it("uses the browser's own install prompt when it offers one (Android, Chrome, Edge)", () => {
    expect(installMode({ standalone: false, canPrompt: true, ios: false })).toBe("prompt");
  });

  it("shows the Add to Home Screen steps on an iPhone or iPad, which has no prompt", () => {
    expect(installMode({ standalone: false, canPrompt: false, ios: true })).toBe("ios-help");
  });

  it("hides the button when the browser cannot install the app", () => {
    expect(installMode({ standalone: false, canPrompt: false, ios: false })).toBe("hidden");
  });
});
