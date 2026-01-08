/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as clerk from "../clerk.js";
import type * as collections from "../collections.js";
import type * as crons from "../crons.js";
import type * as duplicates from "../duplicates.js";
import type * as email from "../email.js";
import type * as feedback from "../feedback.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as instagram from "../instagram.js";
import type * as lib_emails from "../lib/emails.js";
import type * as lib_retriever from "../lib/retriever.js";
import type * as newsletter from "../newsletter.js";
import type * as organizations from "../organizations.js";
import type * as qa from "../qa.js";
import type * as questions from "../questions.js";
import type * as router from "../router.js";
import type * as styles from "../styles.js";
import type * as tags from "../tags.js";
import type * as tones from "../tones.js";
import type * as topics from "../topics.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  auth: typeof auth;
  clerk: typeof clerk;
  collections: typeof collections;
  crons: typeof crons;
  duplicates: typeof duplicates;
  email: typeof email;
  feedback: typeof feedback;
  functions: typeof functions;
  http: typeof http;
  instagram: typeof instagram;
  "lib/emails": typeof lib_emails;
  "lib/retriever": typeof lib_retriever;
  newsletter: typeof newsletter;
  organizations: typeof organizations;
  qa: typeof qa;
  questions: typeof questions;
  router: typeof router;
  styles: typeof styles;
  tags: typeof tags;
  tones: typeof tones;
  topics: typeof topics;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
