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

	try {
		const result = await ctx.runAction(internal.internal.newsletter.getQuestionForUser, { email });
		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error(error);
		return new Response("Failed to get question", { status: 500 });
	}
});

http.route({
	path: "/get-question-for-user",
	method: "POST",
	handler: getQuestionForUserHttp,
});

export default http;
