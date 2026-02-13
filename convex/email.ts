"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const sendEmail = internalAction({
  args: {
    subject: v.string(),
    html: v.string(),
    fromName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resendApiKey = process.env.RESEND_API_TOKEN || process.env.RESEND_API_KEY;
    const adminEmailVar = process.env.CRONS_NOTICE_EMAIL;
    const environment = process.env.ENVIRONMENT;

    if (!resendApiKey) {
      console.error("Resend API key is not set in environment variables.");
      return { success: false, error: "Resend API key is not configured." };
    }
    if (!adminEmailVar) {
      console.error("CRONS_NOTICE_EMAIL is not set. Environment:", environment);
      return { success: false, error: "CRONS_NOTICE_EMAIL is not configured." };
    }

    const adminEmail = adminEmailVar;
    const fromName = args.fromName || "Break the Iceberg Notifier";

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <notifier@breaktheiceberg.com>`,
          to: [adminEmail],
          subject: `${environment || "Production"} - ${args.subject}`,
          html: args.html,
        }),
      });

      let result: any;
      try {
        result = await response.json();
      } catch (err) {
        const rawBody = await response.text();
        result = { body: rawBody, parseError: (err as Error).message };
      }

      if (!response.ok) {
        console.error(`Resend API Error (Status: ${response.status}):`, result);
        return { success: false, error: result.message || result.body || "Failed to send email" };
      }

      console.log("Email sent successfully:", result);
      return { success: true, data: result };
    } catch (e) {
      console.error("Failed to send email:", e);
      return { success: false, error: (e as Error).message };
    }
  },
});
