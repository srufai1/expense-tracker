// Sends one email through Resend's HTTP API (D-34). No SDK: one POST is all
// the weekly email needs. fetch is passed in, so it can be tested.

export const RESEND_URL = "https://api.resend.com/emails";

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; content: Buffer }[];
};

export async function sendWithResend(
  fetchFn: typeof fetch,
  apiKey: string,
  email: OutgoingEmail,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const response = await fetchFn(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.attachments.map((file) => ({ filename: file.filename, content: file.content.toString("base64") })),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!response.ok) {
      const detail = typeof body?.message === "string" ? `: ${body.message}` : ".";
      return { ok: false, error: `Resend answered ${response.status}${detail}` };
    }
    return { ok: true, id: String(body?.id ?? "") };
  } catch (error) {
    return { ok: false, error: `Resend could not be reached: ${(error as Error).message}` };
  }
}
