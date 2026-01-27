export interface NewsletterSubscribeResponse {
	success: boolean;
	status: "verification_required" | "subscribed" | "error";
	message?: string;
	debugUrl?: string;
}
