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
    const resendApiKey = process.env.RESEND_API_KEY;
    const adminEmailVar = process.env.CRONS_NOTICE_EMAIL;
    const environment = process.env.ENVIRONMENT;
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set in environment variables.");
      return { success: false, error: "RESEND_API_KEY is not configured." };
    }
    if (!adminEmailVar) {
      console.error("CRONS_NOTICE_EMAIL is not set in the database.");
      return { success: false, error: "CRONS_NOTICE_EMAIL is not configured." };
    }

    const adminEmail = adminEmailVar;
    const resend = new Resend(resendApiKey);

    try {
      const { data, error } = await resend.emails.send({
        from: "Cron Job Notifier <notifier@breaktheiceberg.com>",
        to: [adminEmail],
        subject: `${environment} - ${args.subject}`,
        html: args.html,
      });

      if (error) {
        console.error("Error sending email:", error.name, error.message);
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
