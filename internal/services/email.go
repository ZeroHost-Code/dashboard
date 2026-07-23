package services

import (
	"fmt"

	"github.com/resend/resend-go/v2"
)

var (
	ResendAPIKey string
	ResendFrom   string
	BaseURL      string
)

func getBaseURL() string {
	return BaseURL
}

func getVerificationEmailHTML(username, verifyURL string) string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Verify your email</title></head>
<body style="margin:0;padding:0;background-color:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f13;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td align="center" style="padding:40px 32px 32px;background:linear-gradient(135deg,#1a1a23 0%,#121218 100%);border-radius:16px 16px 0 0;">
<img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" width="48" height="48" style="display:block;border:0;width:48px;height:48px;">
<h1 style="margin:16px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Zero<span style="color:#ee8132;">Host</span></h1>
</td></tr>
<tr><td style="padding:32px;background-color:#1a1a23;">
<h2 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#ffffff;">Welcome to ZeroHost, ` + username + `!</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a0a0b8;">Thanks for creating an account. To get started, please verify your email address by clicking the button below. This link expires in 24 hours.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="border-radius:8px;">
<a href="` + verifyURL + `" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;background:linear-gradient(135deg,#ee8132 0%,#d96b1e 100%);border-radius:8px;">Verify Email Address</a>
</td></tr></table>
<p style="margin:8px 0 0;font-size:12px;color:#6b6b80;word-break:break-all;">` + verifyURL + `</p>
</td></tr>
<tr><td style="padding:24px 32px;background-color:#121218;border-radius:0 0 16px 16px;text-align:center;">
<p style="margin:0;font-size:12px;color:#4a4a5e;">ZeroHost &mdash; Free game server hosting</p>
</td></tr></table></td></tr></table></body></html>`
}

func getVerificationEmailText(username, verifyURL string) string {
	return fmt.Sprintf("Welcome to ZeroHost, %s!\n\nThanks for creating an account. To get started, please verify your email address. This link expires in 24 hours.\n\n%s\n\nZeroHost — Free game server hosting", username, verifyURL)
}

func SendVerificationEmail(email, username, token string) error {
	verifyURL := getBaseURL() + "/verify-email?token=" + token

	client := resend.NewClient(ResendAPIKey)
	_, err := client.Emails.Send(&resend.SendEmailRequest{
		From:    "ZeroHost <" + ResendFrom + ">",
		To:      []string{email},
		Subject: "Verify your email address — ZeroHost",
		Html:    getVerificationEmailHTML(username, verifyURL),
		Text:    getVerificationEmailText(username, verifyURL),
	})
	return err
}

func getEmailChangeLinkHTML(username, verifyURL, newEmail string) string {
	return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Confirm email change</title></head>
<body style="margin:0;padding:0;background-color:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f13;"><tr><td align="center" style="padding:40px 16px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td align="center" style="padding:40px 32px 32px;background:linear-gradient(135deg,#1a1a23 0%,#121218 100%);border-radius:16px 16px 0 0;">
<img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" width="48" height="48" style="display:block;border:0;width:48px;height:48px;">
<h1 style="margin:16px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Zero<span style="color:#ee8132;">Host</span></h1>
</td></tr>
<tr><td style="padding:32px;background-color:#1a1a23;">
<h2 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#ffffff;">Confirm your email change</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a0a0b8;">Hi ` + username + `, you requested to change your email to <strong style="color:#ffffff;">` + newEmail + `</strong>. Click the button below to confirm.</p>
<table cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="border-radius:8px;">
<a href="` + verifyURL + `" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;background:linear-gradient(135deg,#ee8132 0%,#d96b1e 100%);border-radius:8px;">Confirm Email Change</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 32px;background-color:#121218;border-radius:0 0 16px 16px;text-align:center;">
<p style="margin:0;font-size:12px;color:#4a4a5e;">ZeroHost — Free game server hosting</p>
</td></tr></table></td></tr></table></body></html>`
}

func getEmailChangeLinkText(username, verifyURL, newEmail string) string {
	return fmt.Sprintf("Confirm your email change\n\nHi %s, you requested to change your email to %s. Click this link to confirm:\n\n%s\n\nZeroHost — Free game server hosting", username, newEmail, verifyURL)
}

func SendEmailChangeLink(email, username, token, newEmail string) error {
	verifyURL := getBaseURL() + "/change-email/verify?token=" + token

	client := resend.NewClient(ResendAPIKey)
	_, err := client.Emails.Send(&resend.SendEmailRequest{
		From:    "ZeroHost <" + ResendFrom + ">",
		To:      []string{email},
		Subject: "Confirm your email change — ZeroHost",
		Html:    getEmailChangeLinkHTML(username, verifyURL, newEmail),
		Text:    getEmailChangeLinkText(username, verifyURL, newEmail),
	})
	return err
}

func getEmailChangeCodeHTML(username, code string) string {
	return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Your verification code</title></head>
<body style="margin:0;padding:0;background-color:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f13;"><tr><td align="center" style="padding:40px 16px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td align="center" style="padding:40px 32px 32px;background:linear-gradient(135deg,#1a1a23 0%,#121218 100%);border-radius:16px 16px 0 0;">
<img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" width="48" height="48" style="display:block;border:0;width:48px;height:48px;">
<h1 style="margin:16px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Zero<span style="color:#ee8132;">Host</span></h1>
</td></tr>
<tr><td style="padding:32px;background-color:#1a1a23;">
<h2 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#ffffff;">Your verification code</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a0a0b8;">Hi ` + username + `, here is your verification code to confirm your new email address.</p>
<div style="display:inline-block;padding:18px 48px;font-size:32px;font-weight:700;letter-spacing:8px;color:#ffffff;background:#292524;border-radius:12px;border:1px solid rgba(238,129,50,0.3);font-family:'Courier New',monospace;">` + code + `</div>
</td></tr>
<tr><td style="padding:24px 32px;background-color:#121218;border-radius:0 0 16px 16px;text-align:center;">
<p style="margin:0;font-size:12px;color:#4a4a5e;">ZeroHost — Free game server hosting</p>
</td></tr></table></td></tr></table></body></html>`
}

func getEmailChangeCodeText(username, code string) string {
	return fmt.Sprintf("Your verification code\n\nHi %s, here is your verification code to confirm your new email address:\n\n%s\n\nZeroHost — Free game server hosting", username, code)
}

func SendEmailChangeCode(email, username, code string) error {
	client := resend.NewClient(ResendAPIKey)
	_, err := client.Emails.Send(&resend.SendEmailRequest{
		From:    "ZeroHost <" + ResendFrom + ">",
		To:      []string{email},
		Subject: "Your verification code — ZeroHost",
		Html:    getEmailChangeCodeHTML(username, code),
		Text:    getEmailChangeCodeText(username, code),
	})
	return err
}
