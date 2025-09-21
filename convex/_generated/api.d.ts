/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as categories from "../categories.js";
import type * as crons from "../crons.js";
import type * as duplicates from "../duplicates.js";
import type * as http from "../http.js";
import type * as models from "../models.js";
import type * as questions from "../questions.js";
import type * as router from "../router.js";
import type * as styles from "../styles.js";
import type * as tags from "../tags.js";
import type * as tones from "../tones.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  auth: typeof auth;
  categories: typeof categories;
  crons: typeof crons;
  duplicates: typeof duplicates;
  http: typeof http;
  models: typeof models;
  questions: typeof questions;
  router: typeof router;
  styles: typeof styles;
  tags: typeof tags;
  tones: typeof tones;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
