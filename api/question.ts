import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";

let cachedIndexHtml: string | null = null;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  const { id } = request.query;

  if (typeof id !== "string") {
    return response.status(400).send("Invalid question ID");
  }

  try {
    const convexUrl = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return response.status(500).send("CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL is not set in environment variables.");
    }
    const convex = new ConvexHttpClient(
      convexUrl
    );
    const question = await convex.query(api.core.questions.getQuestionById, { id });

    if (!question) {
      return response.status(404).send("Question not found");
    }

    if (!cachedIndexHtml) {
      const indexPath = path.join(process.cwd(), "dist/index.html");
      cachedIndexHtml = fs.readFileSync(indexPath, "utf-8");
    }
    const dom = new JSDOM(cachedIndexHtml);
    const { document } = dom.window;

    const head = document.getElementsByTagName("head")[0];

    // Handle protocol from x-forwarded-proto, coercion to single string
    let protocol = request.headers["x-forwarded-proto"];
    if (Array.isArray(protocol)) {
      protocol = protocol[0];
    }
    protocol = (protocol === "http" || protocol === "https") ? protocol : "https";

    // Handle host: prefer header, then env, then fallback
    let host = request.headers.host;
    if (!host) {
      host = process.env.NEXT_PUBLIC_APP_HOST || process.env.APP_HOST || process.env.BASE_HOST || "localhost:3000";
    }

    const baseUrl = `${protocol}://${host}`;
    const questionText = question.text || question.customText || "";

    // Remove existing og:* and twitter:* tags from index.html to avoid duplicates
    const existingTags = document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]');
    existingTags.forEach(tag => tag.remove());

    const metaTags = [
      { property: "og:title", content: "Break the Ice(berg)" },
      { property: "og:description", content: questionText },
      { property: "og:url", content: `${baseUrl}/question/${id}` },
      { property: "og:image", content: `${baseUrl}/api/og_question?id=${id}` },
      { property: "og:image:width", content: "1080" },
      { property: "og:image:height", content: "1350" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Break the Ice(berg)" },
      { name: "twitter:description", content: questionText },
      { name: "twitter:image", content: `${baseUrl}/api/og_question?id=${id}` },
    ];

    metaTags.forEach(tagData => {
      const tag = document.createElement("meta");
      Object.entries(tagData).forEach(([key, value]) => {
        tag.setAttribute(key, value);
      });
      head.appendChild(tag);
    });

    return response.status(200).send(dom.serialize());
  } catch (error: any) {
    console.error(error);
    if (error.code === 'ENOENT') {
      return response.status(500).send(`index.html not found at ${error.path}. Please verify build output.`);
    }
    return response.status(500).send("Internal Server Error: " + (error instanceof Error ? error.message : String(error)));
  }
}
