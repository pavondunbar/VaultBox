import { getSmtpEnv, getAppUrl } from "@/lib/env";

export async function sendVerificationEmail(
  toEmail: string,
  token: string,
): Promise<void> {
  const appUrl = getAppUrl();
  const verificationUrl = `${appUrl}/verify-email?token=${token}`;
  const smtp = getSmtpEnv();

  if (!smtp) {
    console.log(
      JSON.stringify({
        type: "email_verification",
        to: toEmail,
        verificationUrl,
        message: "SMTP not configured — log only",
      }),
    );
    return;
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  await transport.sendMail({
    from: smtp.from,
    to: toEmail,
    subject: "VenCura — Verify your email",
    text: `Verify your email by visiting: ${verificationUrl}`,
    html: `<p>Click <a href="${verificationUrl}">here</a> to verify your email.</p>`,
  });
}
