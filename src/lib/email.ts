import { Resend } from "resend";

const ALERT_TO = "kj@kj.ventures";
const ALERT_FROM = "KJ Tweets Alerts <onboarding@resend.dev>";

export async function sendAlert(subject: string, body: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set, skipping alert email");
    return;
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject,
      text: body,
    });
  } catch (error) {
    console.error("Failed to send alert email:", error);
  }
}
