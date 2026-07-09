export function getResendApiKey(): string | undefined {
	return process.env.RESEND_API_TOKEN || process.env.RESEND_API_KEY;
}
