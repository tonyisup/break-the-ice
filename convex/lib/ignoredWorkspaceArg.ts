import { v } from "convex/values";

/**
 * Apps loaded before workspaces were removed still send the workspace they had selected.
 * It is accepted and ignored so those tabs keep working. Remove it once they are gone.
 */
export const ignoredWorkspaceArg = { organizationId: v.optional(v.string()) };
