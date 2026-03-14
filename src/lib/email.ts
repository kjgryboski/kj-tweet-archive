import { Resend } from "resend";

const ALERT_FROM = "KJ Tweets Alerts <onboarding@resend.dev>";

export async function sendAlert(subject: string, body: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set, skipping alert email");
    return;
  }

  const alertTo = process.env.ALERT_EMAIL || "kj@kj.ventures";

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: ALERT_FROM,
      to: alertTo,
      subject,
      text: body,
    });
  } catch (error) {
    console.error("Failed to send alert email:", error);
  }
}
