import fs from "node:fs";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { normalizePagePath, renderPageResponse } from "./_pageMetadata.js";

let cachedIndexHtml: string | null = null;

const getIndexHtml = () => {
  cachedIndexHtml ??= fs.readFileSync(
    path.join(process.cwd(), "dist/index.html"),
    "utf8",
  );
  return cachedIndexHtml;
};

export default function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  try {
    const pathname = normalizePagePath(request.query.path);
    const page = renderPageResponse(getIndexHtml(), pathname);

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    return response.status(page.statusCode).send(page.html);
  } catch (error) {
    console.error(error);
    return response
      .status(500)
      .send(error instanceof Error ? error.message : "Unable to render page");
  }
}
