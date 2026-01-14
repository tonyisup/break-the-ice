"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const sendEmail = internalAction({
  args: {
    subject: v.string(),
    html: v.string(),
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

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Cron Job Notifier <notifier@breaktheiceberg.com>",
          to: [adminEmail],
          subject: `${environment || "Production"} - ${args.subject}`,
          html: args.html,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Resend API Error:", result);
        return { success: false, error: result.message || "Failed to send email" };
      }

      console.log("Email sent successfully:", result);
      return { success: true, data: result };
    } catch (e) {
      console.error("Failed to send email:", e);
      return { success: false, error: (e as Error).message };
    }
  },
});
