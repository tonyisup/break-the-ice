"use node";

import { internalAction } from "./_generated/server";
import { Resend } from "resend";
import { v } from "convex/values";

export const sendEmail = internalAction({
  args: {
    subject: v.string(),
    html: v.string(),
  },
  handler: async (ctx, args) => {
    const resendApiKey = process.env.CONVEX_RESEND_API_KEY;
    const adminEmailVar = process.env.ADMIN_EMAIL;

    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set in environment variables.");
      return { success: false, error: "CONVEX_RESEND_API_KEY is not configured." };
    }
    if (!adminEmailVar || !adminEmailVar.value) {
      console.error("ADMIN_EMAIL is not set in the database.");
      return { success: false, error: "ADMIN_EMAIL is not configured." };
    }

    const adminEmail = adminEmailVar.value;
    const resend = new Resend(resendApiKey);

    try {
      const { data, error } = await resend.emails.send({
        from: "Cron Job Notifier <notifier@breaktheiceberg.com>",
        to: [adminEmail],
        subject: args.subject,
        html: args.html,
      });

      if (error) {
        console.error("Error sending email:", error);
        return { success: false, error: error.message };
      }

      console.log("Email sent successfully:", data);
      return { success: true, data };
    } catch (e) {
      console.error("Failed to send email:", e);
      return { success: false, error: (e as Error).message };
    }
  },
});
