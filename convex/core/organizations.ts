import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Workspaces are gone. Apps loaded before that still ask for this list when the account menu
 * opens, and a missing function would break the page. Remove it once those tabs are gone.
 */
export const getOrganizations = query({
	args: {},
	returns: v.array(v.any()),
	handler: () => [],
});
