import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@zero-host.org';
const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://dashboard.zero-host.org'
  : `http://localhost:${process.env.PORT || 3000}`;

export function getVerificationEmailHtml(username, verifyUrl) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="https://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Verify your email</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>
    table {border-collapse:collapse;}
    td,th,div,p,a {font-size:inherit;line-height:inherit;}
    .email-container {width:600px!important;}
  </style>
  <![endif]-->
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .email-padding { padding: 24px 20px !important; }
      .email-button { padding: 14px 28px !important; font-size: 15px !important; }
      .email-header { padding: 32px 20px 24px !important; }
      .email-footer { padding: 20px !important; }
      .email-logo img { width: 44px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f13;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td class="email-header" align="center" style="padding:40px 32px 32px;background:linear-gradient(135deg,#1a1a23 0%,#121218 100%);border-radius:16px 16px 0 0;">
              <!--[if mso]>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td align="center">
              <![endif]-->
              <table role="presentation" class="email-logo" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" width="48" height="48" style="display:block;border:0;outline:none;width:48px;height:48px;">
                  </td>
                </tr>
              </table>
              <!--[if mso]>
                </td></tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td align="center">
              <![endif]-->
              <h1 style="margin:16px 0 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Zero<span style="color:#ee8132;">Host</span></h1>
              <!--[if mso]>
                </td></tr>
              </table>
              <![endif]-->
            </td>
          </tr>
          <tr>
            <td class="email-padding" style="padding:32px;background-color:#1a1a23;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom:20px;">
                    <h2 style="margin:0;font-size:20px;font-weight:600;color:#ffffff;letter-spacing:-0.2px;">Welcome to ZeroHost, ${username}!</h2>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:24px;">
                    <p style="margin:0;font-size:15px;line-height:1.6;color:#a0a0b8;">Thanks for creating an account. To get started, please verify your email address by clicking the button below. This link expires in 24 hours.</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="border-radius:8px;">
                          <a href="${verifyUrl}" target="_blank" class="email-button" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;background:linear-gradient(135deg,#ee8132 0%,#d96b1e 100%);border-radius:8px;letter-spacing:0.3px;">Verify Email Address</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:8px;">
                    <p style="margin:0;font-size:13px;line-height:1.5;color:#6b6b80;">Or copy and paste this link in your browser:</p>
                    <p style="margin:4px 0 0;font-size:12px;line-height:1.5;color:#6b6b80;word-break:break-all;">${verifyUrl}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-footer" style="padding:24px 32px;background-color:#121218;border-radius:0 0 16px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#4a4a5e;">You're receiving this email because you created an account on ZeroHost.</p>
                    <p style="margin:0;font-size:12px;line-height:1.5;color:#4a4a5e;">ZeroHost &mdash; Free game server hosting</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function getVerificationEmailText(username, verifyUrl) {
  return `Welcome to ZeroHost, ${username}!

Thanks for creating an account. To get started, please verify your email address by clicking the link below. This link expires in 24 hours.

${verifyUrl}

If you didn't create this account, you can safely ignore this email.

ZeroHost — Free game server hosting`;
}

export async function sendVerificationEmail(email, username, token) {
  const verifyUrl = `${BASE_URL}/verify-email?token=${token}`;

  const { error } = await resend.emails.send({
    from: `ZeroHost <${FROM}>`,
    to: [email],
    subject: 'Verify your email address — ZeroHost',
    html: getVerificationEmailHtml(username, verifyUrl),
    text: getVerificationEmailText(username, verifyUrl),
  });

  if (error) {
    console.error('Failed to send verification email:', error);
    throw new Error('Failed to send verification email');
  }
}

export function getEmailChangeLinkHtml(username, verifyUrl, newEmail) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm email change</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .email-padding { padding: 24px 20px !important; }
      .email-button { padding: 14px 28px !important; font-size: 15px !important; }
      .email-header { padding: 32px 20px 24px !important; }
      .email-footer { padding: 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f13;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td class="email-header" align="center" style="padding:40px 32px 32px;background:linear-gradient(135deg,#1a1a23 0%,#121218 100%);border-radius:16px 16px 0 0;">
              <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" width="48" height="48" style="display:block;border:0;outline:none;width:48px;height:48px;">
              <h1 style="margin:16px 0 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Zero<span style="color:#ee8132;">Host</span></h1>
            </td>
          </tr>
          <tr>
            <td class="email-padding" style="padding:32px;background-color:#1a1a23;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom:20px;">
                    <h2 style="margin:0;font-size:20px;font-weight:600;color:#ffffff;">Confirm your email change</h2>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:24px;">
                    <p style="margin:0;font-size:15px;line-height:1.6;color:#a0a0b8;">Hi ${username}, you requested to change your email to <strong style="color:#ffffff;">${newEmail}</strong>. Click the button below to confirm. This link expires in 1 hour.</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="border-radius:8px;">
                          <a href="${verifyUrl}" target="_blank" class="email-button" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;background:linear-gradient(135deg,#ee8132 0%,#d96b1e 100%);border-radius:8px;">Confirm Email Change</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0;font-size:13px;line-height:1.5;color:#6b6b80;">Or copy and paste this link:</p>
                    <p style="margin:4px 0 0;font-size:12px;line-height:1.5;color:#6b6b80;word-break:break-all;">${verifyUrl}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-footer" style="padding:24px 32px;background-color:#121218;border-radius:0 0 16px 16px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#4a4a5e;text-align:center;">If you didn't request this, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function getEmailChangeLinkText(username, verifyUrl, newEmail) {
  return `Confirm your email change

Hi ${username}, you requested to change your email to ${newEmail}. Click the link below to confirm. This link expires in 1 hour.

${verifyUrl}

If you didn't request this, you can safely ignore this email.

ZeroHost — Free game server hosting`;
}

export function getEmailChangeCodeHtml(username, code) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your verification code</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .email-padding { padding: 24px 20px !important; }
      .email-header { padding: 32px 20px 24px !important; }
      .email-footer { padding: 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f13;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td class="email-header" align="center" style="padding:40px 32px 32px;background:linear-gradient(135deg,#1a1a23 0%,#121218 100%);border-radius:16px 16px 0 0;">
              <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" width="48" height="48" style="display:block;border:0;outline:none;width:48px;height:48px;">
              <h1 style="margin:16px 0 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Zero<span style="color:#ee8132;">Host</span></h1>
            </td>
          </tr>
          <tr>
            <td class="email-padding" style="padding:32px;background-color:#1a1a23;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom:20px;">
                    <h2 style="margin:0;font-size:20px;font-weight:600;color:#ffffff;">Your verification code</h2>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:24px;">
                    <p style="margin:0;font-size:15px;line-height:1.6;color:#a0a0b8;">Hi ${username}, here is your verification code to confirm your new email address. This code expires in 10 minutes.</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <div style="display:inline-block;padding:18px 48px;font-size:32px;font-weight:700;letter-spacing:8px;color:#ffffff;background:#292524;border-radius:12px;border:1px solid rgba(238,129,50,0.3);font-family:'Courier New',monospace;">${code}</div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0;font-size:13px;line-height:1.5;color:#6b6b80;">If you didn't request this, you can safely ignore this email.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-footer" style="padding:24px 32px;background-color:#121218;border-radius:0 0 16px 16px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#4a4a5e;text-align:center;">ZeroHost — Free game server hosting</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function getEmailChangeCodeText(username, code) {
  return `Your verification code

Hi ${username}, here is your verification code to confirm your new email address. This code expires in 10 minutes.

${code}

If you didn't request this, you can safely ignore this email.

ZeroHost — Free game server hosting`;
}

export async function sendEmailChangeLink(email, username, token, newEmail) {
  const verifyUrl = `${BASE_URL}/change-email/verify?token=${token}`;

  const { error } = await resend.emails.send({
    from: `ZeroHost <${FROM}>`,
    to: [email],
    subject: 'Confirm your email change — ZeroHost',
    html: getEmailChangeLinkHtml(username, verifyUrl, newEmail),
    text: getEmailChangeLinkText(username, verifyUrl, newEmail),
  });

  if (error) {
    console.error('Failed to send email change link:', error);
    throw new Error('Failed to send confirmation email');
  }
}

export async function sendEmailChangeCode(email, username, code) {
  const { error } = await resend.emails.send({
    from: `ZeroHost <${FROM}>`,
    to: [email],
    subject: 'Your verification code — ZeroHost',
    html: getEmailChangeCodeHtml(username, code),
    text: getEmailChangeCodeText(username, code),
  });

  if (error) {
    console.error('Failed to send email change code:', error);
    throw new Error('Failed to send verification code');
  }
}
