const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const EMAIL_ENABLED = !!RESEND_API_KEY;

export function isEmailConfigured() {
  return EMAIL_ENABLED;
}

export async function sendPasswordResetEmail({ to, username, resetUrl, expiresMinutes = 30 }) {
  const subject = 'Reset your Lovioa password';
  const text = [
    `Hi ${username || 'there'},`,
    '',
    'We received a request to reset your password.',
    `This link will expire in ${expiresMinutes} minutes.`,
    '',
    resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:560px;">
      <h2 style="margin:0 0 12px;">Reset your Lovioa password</h2>
      <p>Hi ${username || 'there'},</p>
      <p>We received a request to reset your password.</p>
      <p>This link will expire in <strong>${expiresMinutes} minutes</strong>.</p>
      <p><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">Reset password</a></p>
      <p style="word-break:break-all;color:#555;">${resetUrl}</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  if (!EMAIL_ENABLED) {
    console.warn('[auth] Resend not configured, password reset link:', resetUrl);
    return { delivered: false, fallback: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend request failed: ${response.status} ${detail}`);
  }

  return { delivered: true, fallback: false };
}
