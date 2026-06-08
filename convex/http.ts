import router from "./router";
import { usersWebhook } from "./clerk";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = router;

// Clerk handles authentication via ConvexProviderWithClerk
// No need to add Convex Auth HTTP routes


http.route({
	path: "/clerk-users-webhook",
	method: "POST",
	handler: usersWebhook,
});

http.route({
	path: "/clerk-billing-webhook",
	method: "POST",
	handler: usersWebhook,
});

export const getQuestionForUserHttp = httpAction(async (ctx, request) => {
	const authHeader = request.headers.get("Authorization");
	const expectedToken = process.env.N8N_WEBHOOK_SECRET;

	if (!expectedToken) {
		console.error("N8N_WEBHOOK_SECRET is not configured for /get-question-for-user");
		return new Response("Server misconfiguration", { status: 500 });
	}

	if (authHeader !== `Bearer ${expectedToken}`) {
		return new Response("Unauthorized", { status: 401 });
	}

	const { email } = await request.json();

	if (!email) {
		return new Response("Missing email", { status: 400 });
	}

	let attempts = 0;
	const maxAttempts = 3;

	while (attempts < maxAttempts) {
		try {
			const result = await ctx.runAction(internal.internal.newsletter.getQuestionForUser, { email });
			return new Response(JSON.stringify(result), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error: any) {
			attempts++;
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`Attempt ${attempts} failed:`, error);

			const isRecoverable =
				errorMessage.includes("There are no available workers to process the request") ||
				errorMessage.includes("Your request couldn't be completed. Try again later.");

			if (isRecoverable && attempts < maxAttempts) {
				const delay = Math.pow(2, attempts) * 1000;
				await new Promise(resolve => setTimeout(resolve, delay));
				continue;
			}

			return new Response("Failed to get question", { status: 500 });
		}
	}

	return new Response("Failed to get question", { status: 500 });
});

http.route({
	path: "/get-question-for-user",
	method: "POST",
	handler: getQuestionForUserHttp,
});

export default http;
