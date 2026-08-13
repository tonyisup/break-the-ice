function firstConfiguredValue(...values: Array<string | undefined>): string | undefined {
	return values.map((value) => value?.trim()).find(Boolean);
}

export function getResendApiKey(): string | undefined {
	return firstConfiguredValue(process.env.RESEND_API_TOKEN, process.env.RESEND_API_KEY);
}

export function getResendContactsApiKey(): string | undefined {
	return firstConfiguredValue(
		process.env.RESEND_CONTACTS_API_KEY,
		process.env.RESEND_API_KEY,
		process.env.RESEND_API_TOKEN,
	);
}
