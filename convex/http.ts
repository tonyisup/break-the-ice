import router from "./router";
import { usersWebhook } from "./clerk";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = router;

// Clerk handles authentication via ConvexProviderWithClerk
// No need to add Convex Auth HTTP routes


http.route({
	path: "/clerk-users-webhook",
	method: "POST",
	handler: usersWebhook,
});

export const getQuestionForUserHttp = httpAction(async (ctx, request) => {
	const { email } = await request.json();

	if (!email) {
		return new Response("Missing email", { status: 400 });
	}

	try {
		const result = await ctx.runAction(api.core.newsletter.getQuestionForUser, { email });
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
