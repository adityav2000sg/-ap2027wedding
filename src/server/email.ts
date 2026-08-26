import "server-only";

/**
 * Email, via Resend.
 *
 * Called through fetch rather than the SDK — one HTTP call, no dependency, and
 * we control the failure messages.
 *
 * With no API key configured, sending is a no-op that logs the message. That
 * keeps local development working without credentials; `sendLoginCode` prints
 * the code to the server console so you can still sign in.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && fromAddress());
}

/**
 * The verified sender. Resend will reject anything from a domain you haven't
 * verified, so this must be a real address on a domain you control.
 */
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
    // Not configured — say so loudly in the log rather than failing silently.
    console.warn(
      `[email] Not configured (RESEND_API_KEY / RESEND_FROM_EMAIL missing). ` +
      `Would have sent "${input.subject}" to ${input.to}.`,
    );
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

    // Resend's most common production failure: the sending domain isn't
    // verified, or you're on the test key which only mails your own address.
    if (response.status === 403 || body.includes("domain")) {
      throw new EmailError(
        "The sending address hasn't been verified with Resend yet, so the code couldn't be sent.",
      );
    }
    if (response.status === 429) {
      throw new EmailError("Too many emails at once. Wait a minute and try again.");
    }
    throw new EmailError("The email couldn't be sent. Try again shortly.");
  }
}

/** The sign-in code email. Plain, short, and obviously not a phishing attempt. */
export function loginCodeEmail(code: string, name: string, minutes: number) {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;

  return {
    subject: `${code} is your sign-in code`,
    text: [
      `Hello ${name},`,
      ``,
      `Your sign-in code for Avantika & Prateek's wedding planner is:`,
      ``,
      `    ${spaced}`,
      ``,
      `It expires in ${minutes} minutes and can only be used once.`,
      ``,
      `If you didn't try to sign in, you can ignore this — nobody can get in`,
      `without the code.`,
    ].join("\n"),
    html: `
<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#fbf8f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1714;">
    <div style="max-width:440px;margin:0 auto;">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a8078;">
        The wedding of
      </p>
      <h1 style="margin:0 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;color:#1a1714;">
        Avantika <span style="color:#bd6b3a;">&amp;</span> Prateek
      </h1>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hello ${escapeHtml(name)},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">
        Here's your sign-in code:
      </p>

      <div style="margin:0 0 20px;padding:18px;background:#ffffff;border:1px solid #e9e1d5;border-radius:12px;text-align:center;">
        <span style="font-size:32px;letter-spacing:.18em;font-weight:600;font-variant-numeric:tabular-nums;">
          ${spaced}
        </span>
      </div>

      <p style="margin:0 0 20px;font-size:13.5px;line-height:1.55;color:#55504a;">
        It expires in ${minutes} minutes and can only be used once.
      </p>
      <p style="margin:0;font-size:12.5px;line-height:1.55;color:#8a8078;">
        If you didn't try to sign in, you can ignore this. Nobody can get in
        without the code.
      </p>
    </div>
  </body>
</html>`.trim(),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
