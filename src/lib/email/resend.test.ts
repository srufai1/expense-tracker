import { describe, expect, it } from "vitest";

import { RESEND_URL, sendWithResend } from "./resend";

const EMAIL = {
  from: "Expense Tracker <onboarding@resend.dev>",
  to: "me@example.com",
  subject: "Your week",
  html: "<p>Hi</p>",
  text: "Hi",
  attachments: [{ filename: "weekly-report.pdf", content: Buffer.from("%PDF-1.3") }],
  idempotencyKey: "weekly-report/u1/2026-10-19",
};

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("sendWithResend", () => {
  it("posts the email with the PDF as base64 and the key as a bearer token", async () => {
    const { fn, calls } = fakeFetch(200, { id: "email_123" });
    expect(await sendWithResend(fn, "re_test_key", EMAIL)).toEqual({ ok: true, id: "email_123" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(RESEND_URL);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    // Resend sends one email per key, even if the same request comes twice.
    expect((calls[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe("weekly-report/u1/2026-10-19");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      from: EMAIL.from,
      to: ["me@example.com"],
      subject: "Your week",
      html: "<p>Hi</p>",
      text: "Hi",
      attachments: [{ filename: "weekly-report.pdf", content: Buffer.from("%PDF-1.3").toString("base64") }],
    });
  });

  it("reports Resend's own error message", async () => {
    const { fn } = fakeFetch(403, { name: "validation_error", message: "You can only send testing emails to your own email address." });
    expect(await sendWithResend(fn, "k", EMAIL)).toEqual({
      ok: false,
      error: "Resend answered 403: You can only send testing emails to your own email address.",
    });
    const { fn: plain } = fakeFetch(500, "oops");
    expect(await sendWithResend(plain, "k", EMAIL)).toEqual({ ok: false, error: "Resend answered 500." });
  });

  it("counts a 200 as sent even if Resend sends no id back", async () => {
    const { fn } = fakeFetch(200, {});
    expect(await sendWithResend(fn, "k", EMAIL)).toEqual({ ok: true, id: "" });
  });

  it("copes with a reply that is not JSON", async () => {
    const html = (async () => new Response("<html>Bad gateway</html>", { status: 502 })) as unknown as typeof fetch;
    expect(await sendWithResend(html, "k", EMAIL)).toEqual({ ok: false, error: "Resend answered 502." });
  });

  it("reports a network failure instead of throwing", async () => {
    const down = (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    expect(await sendWithResend(down, "k", EMAIL)).toEqual({
      ok: false,
      error: "Resend could not be reached: getaddrinfo ENOTFOUND",
    });
  });
});
