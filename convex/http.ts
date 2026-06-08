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
	let hadRetry = false;

	while (attempts < maxAttempts) {
		try {
			const result = await ctx.runAction(internal.internal.newsletter.getQuestionForUser, { email });

			if (hadRetry) {
				console.log(`Successfully retrieved question after ${attempts + 1} attempt(s)`);
			}

			return new Response(JSON.stringify(result), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error: any) {
			attempts++;
			hadRetry = true;
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`Attempt ${attempts} failed:`, error);

			// Normalize error handling to support multiple error shapes:
			// 1. Convex error: error.data.kind, error.data.retryAfter, error.statusCode
			// 2. APIError (OpenAI): error.status, error.headers['retry-after']
			const status = error.status ?? error.statusCode;
			const isRateLimited = error.data?.kind === "RateLimited";
			const hasRetryAfter =
				error.data?.retryAfter ||
				(error.headers instanceof Headers ? error.headers.get("retry-after") : error.headers?.["retry-after"]);
			const is5xxError = status !== undefined && status >= 500;
			const isWorkerError = errorMessage.includes("worker");

			const isRecoverable = isRateLimited || hasRetryAfter || is5xxError || isWorkerError;

			if (isRecoverable && attempts < maxAttempts) {
				const delay = Math.pow(2, attempts) * 1000;
				await new Promise(resolve => setTimeout(resolve, delay));
				continue;
			}

			return new Response("Failed to get question", { status: 500 });
		}
	}
});

http.route({
	path: "/get-question-for-user",
	method: "POST",
	handler: getQuestionForUserHttp,
});

export default http;
