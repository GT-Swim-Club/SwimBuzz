import { Resend } from "resend"

type SendEmailInput = {
  to: string
  subject: string
  text: string
  html: string
}

/**
 * Sends transactional email via Resend.
 * In development without RESEND_API_KEY, logs the message instead.
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
}: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from =
    process.env.EMAIL_FROM || "SwimBuzz <onboarding@resend.dev>"

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured")
    }
    console.info("[email:dev]", { to, subject, text })
    return
  }

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    text,
    html,
  })

  if (error) {
    throw new Error(error.message || "Failed to send email")
  }
}
