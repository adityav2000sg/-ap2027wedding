import "server-only";

/** Email delivery via Resend. */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && fromAddress());
}

function fromAddress(): string | undefined {
  return process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM;
}

export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailError";
  }
}

interface SendInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(input: SendInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = fromAddress();

  if (!apiKey || !from) {
    const message =
      "Email sign-in is not configured yet. Add RESEND_API_KEY and RESEND_FROM_EMAIL.";
    if (process.env.NODE_ENV === "production") {
      throw new EmailError(message);
    }
    console.warn(`[email] ${message} Would have sent \"${input.subject}\" to ${input.to}.`);
    return;
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      throw new EmailError("The email service timed out. Try again in a moment.");
    }
    throw new EmailError("Couldn't reach the email service.");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[email] Resend ${response.status}: ${body.slice(0, 400)}`);

    if (response.status === 403 || body.toLowerCase().includes("domain")) {
      throw new EmailError(
        "The sending address is not verified with Resend yet, so the code could not be sent.",
      );
    }
    if (response.status === 429) {
      throw new EmailError("Too many emails at once. Wait a minute and try again.");
    }
    throw new EmailError("The email couldn't be sent. Try again shortly.");
  }
}

export function loginCodeEmail(code: string, name: string, minutes: number) {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    subject: `${code} is your sign-in code`,
    text: [
      `Hello ${name},`,
      "",
      "Your sign-in code for Avantika & Prateek's wedding planner is:",
      "",
      `    ${spaced}`,
      "",
      `It expires in ${minutes} minutes and can only be used once.`,
      "",
      "If you didn't try to sign in, you can ignore this.",
    ].join("\n"),
    html: `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#fbf8f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1714;"><div style="max-width:440px;margin:0 auto;"><p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a8078;">The wedding of</p><h1 style="margin:0 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;color:#1a1714;">Avantika <span style="color:#bd6b3a;">&amp;</span> Prateek</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hello ${escapeHtml(name)},</p><p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Here's your sign-in code:</p><div style="margin:0 0 20px;padding:18px;background:#fff;border:1px solid #e9e1d5;border-radius:12px;text-align:center;"><span style="font-size:32px;letter-spacing:.18em;font-weight:600;font-variant-numeric:tabular-nums;">${spaced}</span></div><p style="margin:0 0 20px;font-size:13.5px;line-height:1.55;color:#55504a;">It expires in ${minutes} minutes and can only be used once.</p><p style="margin:0;font-size:12.5px;line-height:1.55;color:#8a8078;">If you didn't try to sign in, you can ignore this.</p></div></body></html>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
