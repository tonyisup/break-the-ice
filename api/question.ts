import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  const { id } = request.query;

  if (typeof id !== "string") {
    return response.status(400).send("Invalid question ID");
  }

  try {
    const convexUrl = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;
    if (!convexUrl) {
      return response.status(500).send("CONVEX_URL or VITE_CONVEX_URL is not set in environment variables.");
    }
    const convex = new ConvexHttpClient(
      convexUrl
    );
    const question = await convex.query(api.questions.getQuestionById, { id });

    if (!question) {
      return response.status(404).send("Question not found");
    }

    const indexPath = path.join(process.cwd(), "dist/index.html");
    const indexHtml = fs.readFileSync(indexPath, "utf-8");
    const dom = new JSDOM(indexHtml);
    const { document } = dom.window;

    const head = document.getElementsByTagName("head")[0];

    const ogTitle = document.createElement("meta");
    ogTitle.setAttribute("property", "og:title");
    ogTitle.setAttribute("content", "Break the Ice(berg)");
    head.appendChild(ogTitle);

    const ogDescription = document.createElement("meta");
    ogDescription.setAttribute("property", "og:description");
    ogDescription.setAttribute("content", question.text ?? "");
    head.appendChild(ogDescription);

    const ogUrl = document.createElement("meta");
    ogUrl.setAttribute("property", "og:url");
    ogUrl.setAttribute(
      "content",
      `https://iceberg-breaker.vercel.app/question/${id}`
    );
    head.appendChild(ogUrl);

    const ogImage = document.createElement("meta");
    ogImage.setAttribute("property", "og:image");
    ogImage.setAttribute(
      "content",
      "https://iceberg-breaker.vercel.app/og-preview.png"
    );
    head.appendChild(ogImage);

    return response.status(200).send(dom.serialize());
  } catch (error: any) {
    console.error(error);
    if (error.code === 'ENOENT') {
      return response.status(500).send(`index.html not found at ${error.path}. Please verify build output.`);
    }
    return response.status(500).send("Internal Server Error: " + (error instanceof Error ? error.message : String(error)));
  }
}
