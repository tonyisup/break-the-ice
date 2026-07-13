import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { convexFunctionModules } from "../vitestConvexModules";

describe("newsletter contact authorization", () => {
  test("anonymous callers cannot inspect arbitrary email status", async () => {
    const t = convexTest(schema, convexFunctionModules);
    await expect(t.action(api.resend.getContactStatus, {})).rejects.toThrow(
      "Not authenticated",
    );
  });

  test("a signed unsubscribe token grants access only to its stored email", async () => {
    const t = convexTest(schema, convexFunctionModules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        email: "subscriber@example.com",
        newsletterSubscriptionStatus: "subscribed",
        newsletterUnsubscribeToken: "signed-token",
      });
    });

    const status = await t.action(api.resend.getContactStatus, {
      token: "signed-token",
    });
    expect(status).toMatchObject({
      subscribed: true,
      email: "subscriber@example.com",
    });

    await expect(
      t.action(api.resend.unsubscribeContact, { token: "wrong-token" }),
    ).rejects.toThrow("Invalid unsubscribe link");

    await t.action(api.resend.unsubscribeContact, { token: "signed-token" });
    const user = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", "subscriber@example.com"))
        .unique(),
    );
    expect(user?.newsletterSubscriptionStatus).toBe("unsubscribed");
  });
});
