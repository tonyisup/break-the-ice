/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_ai from "../admin/ai.js";
import type * as admin_duplicates from "../admin/duplicates.js";
import type * as admin_feedback from "../admin/feedback.js";
import type * as admin_manual_pruning_test from "../admin/manual_pruning_test.js";
import type * as admin_pruning from "../admin/pruning.js";
import type * as admin_questions from "../admin/questions.js";
import type * as admin_styles from "../admin/styles.js";
import type * as admin_tags from "../admin/tags.js";
import type * as admin_tones from "../admin/tones.js";
import type * as admin_topics from "../admin/topics.js";
import type * as admin_users from "../admin/users.js";
import type * as auth from "../auth.js";
import type * as clerk from "../clerk.js";
import type * as core_ai from "../core/ai.js";
import type * as core_collections from "../core/collections.js";
import type * as core_feedback from "../core/feedback.js";
import type * as core_newsletter from "../core/newsletter.js";
import type * as core_organizations from "../core/organizations.js";
import type * as core_questions from "../core/questions.js";
import type * as core_styles from "../core/styles.js";
import type * as core_tags from "../core/tags.js";
import type * as core_tones from "../core/tones.js";
import type * as core_topics from "../core/topics.js";
import type * as core_userSettings from "../core/userSettings.js";
import type * as core_users from "../core/users.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as instagram from "../instagram.js";
import type * as internal_ai from "../internal/ai.js";
import type * as internal_migrations from "../internal/migrations.js";
import type * as internal_qa from "../internal/qa.js";
import type * as internal_questions from "../internal/questions.js";
import type * as internal_styles from "../internal/styles.js";
import type * as internal_subscriptions from "../internal/subscriptions.js";
import type * as internal_tones from "../internal/tones.js";
import type * as internal_topics from "../internal/topics.js";
import type * as internal_users from "../internal/users.js";
import type * as lib_emails from "../lib/emails.js";
import type * as lib_retriever from "../lib/retriever.js";
import type * as resend from "../resend.js";
import type * as router from "../router.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/ai": typeof admin_ai;
  "admin/duplicates": typeof admin_duplicates;
  "admin/feedback": typeof admin_feedback;
  "admin/manual_pruning_test": typeof admin_manual_pruning_test;
  "admin/pruning": typeof admin_pruning;
  "admin/questions": typeof admin_questions;
  "admin/styles": typeof admin_styles;
  "admin/tags": typeof admin_tags;
  "admin/tones": typeof admin_tones;
  "admin/topics": typeof admin_topics;
  "admin/users": typeof admin_users;
  auth: typeof auth;
  clerk: typeof clerk;
  "core/ai": typeof core_ai;
  "core/collections": typeof core_collections;
  "core/feedback": typeof core_feedback;
  "core/newsletter": typeof core_newsletter;
  "core/organizations": typeof core_organizations;
  "core/questions": typeof core_questions;
  "core/styles": typeof core_styles;
  "core/tags": typeof core_tags;
  "core/tones": typeof core_tones;
  "core/topics": typeof core_topics;
  "core/userSettings": typeof core_userSettings;
  "core/users": typeof core_users;
  crons: typeof crons;
  email: typeof email;
  functions: typeof functions;
  http: typeof http;
  instagram: typeof instagram;
  "internal/ai": typeof internal_ai;
  "internal/migrations": typeof internal_migrations;
  "internal/qa": typeof internal_qa;
  "internal/questions": typeof internal_questions;
  "internal/styles": typeof internal_styles;
  "internal/subscriptions": typeof internal_subscriptions;
  "internal/tones": typeof internal_tones;
  "internal/topics": typeof internal_topics;
  "internal/users": typeof internal_users;
  "lib/emails": typeof lib_emails;
  "lib/retriever": typeof lib_retriever;
  resend: typeof resend;
  router: typeof router;
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
