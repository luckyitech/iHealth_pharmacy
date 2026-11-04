import nodemailer from 'nodemailer';

/**
 * @typedef {object} MailMessage
 * @property {string} to
 * @property {string} subject
 * @property {string} text Plain text only: short, readable in any mail client.
 */

/** @typedef {{ send: (message: MailMessage) => Promise<void> }} Mailer */

/**
 * SMTP mailer. In development it points at Mailpit (http://localhost:8025), which catches every message.
 *
 * @param {Readonly<import('../config/env.js').Config['mail']>} mail
 * @returns {Mailer}
 */
export function createMailer(mail) {
  const transport = nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    ...(mail.user ? { auth: { user: mail.user, pass: mail.pass } } : {}),
  });
  return {
    async send({ to, subject, text }) {
      await transport.sendMail({ from: mail.from, to, subject, text });
    },
  };
}
