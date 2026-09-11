import nodemailer from "nodemailer";

export interface Recipient {
  email: string;
  name?: string;
}

export interface SendEmailOptions {
  subject: string;
  htmlContent: string;
  recipients: Recipient[];
}

export interface SendResult {
  messageId?: string;
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends HTML email to multiple recipients individually (no address leaking).
 */
export async function sendCampaignEmail(opts: SendEmailOptions): Promise<SendResult> {
  const from = process.env.SMTP_FROM;
  if (!from) throw new Error("SMTP_FROM is not set");

  const transporter = createTransport();
  let lastMessageId: string | undefined;

  for (const recipient of opts.recipients) {
    const info = await transporter.sendMail({
      from,
      to: recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
      subject: opts.subject,
      html: opts.htmlContent,
    });
    lastMessageId = info.messageId;
  }

  return { messageId: lastMessageId };
}
