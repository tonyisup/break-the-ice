/**
 * Billing subject model:
 *
 * - **Personal workspace** (`organizationId` unset): individual subscription fields on
 *   `users` — `billingSubjectType: "user"`, `billingStatus`, `clerkCustomerId`,
 *   `clerkSubscriptionId`. AI limits use `userAiUsage` with unset `organizationId`.
 *
 * - **Organization workspace**: team subscription on `organizations` — `planTier`,
 *   `billingStatus`, Clerk customer/subscription ids on the org row. Members inherit
 *   team entitlements via `getEffectivePlanForUser` when `organizationId` is passed.
 *   User rows should not carry org subscription state; `billingSubjectType` on the user
 *   remains `"user"` only when they pay individually.
 *
 * Do not store org billing on `users` except the subject-type marker for personal plans.
 */

export type BillingSubjectType = "user" | "organization";

export const PERSONAL_BILLING_SUBJECT: BillingSubjectType = "user";
