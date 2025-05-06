import type { Question } from "@prisma/client"; 

const SKIPPED_TAGS_KEY = "break-the-ice-skipped-tags";
const LIKED_TAGS_KEY = "break-the-ice-liked-tags";
const BLOCKED_TAGS_KEY = "break-the-ice-blocked-tags";


/**
 * Save a skipped tag to local storage
 */
export function saveSkippedTag(tag: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const skippedTags = getSkippedTags();
    if (!skippedTags.includes(tag)) {
      skippedTags.push(tag);
      localStorage.setItem(SKIPPED_TAGS_KEY, JSON.stringify(skippedTags));
    }
  } catch (error) {
    console.error("Failed to save skipped tag to local storage:", error);
  }
}

/**
 * Get all skipped tags from local storage
 */
export function getSkippedTags(): string[] {
  if (typeof window === "undefined") return [];
  
  try {
    const storedData = localStorage.getItem(SKIPPED_TAGS_KEY);
    return storedData ? JSON.parse(storedData) as string[] : [];
  } catch (error) {
    console.error("Failed to get skipped tags from local storage:", error);
    return [];
  }
}

/**
 * Check if a tag has been skipped
 */
export function isTagSkipped(tag: string): boolean {
  if (typeof window === "undefined") return false;
  
  try {
    const skippedTags = getSkippedTags();
    return skippedTags.includes(tag);
  } catch (error) {
    console.error("Failed to check if tag is skipped:", error);
    return false;
  }
}

/**
 * Remove a tag from the skipped list
 */
export function removeSkippedTag(tag: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const skippedTags = getSkippedTags();
    const updatedTags = skippedTags.filter(t => t !== tag);
    localStorage.setItem(SKIPPED_TAGS_KEY, JSON.stringify(updatedTags));
  } catch (error) {
    console.error("Failed to remove skipped tag from local storage:", error);
  }
}

/**
 * Save a liked tag to local storage
 */
export function saveLikedTag(tag: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const likedTags = getLikedTags();
    if (!likedTags.includes(tag)) {
      likedTags.push(tag);
      localStorage.setItem(LIKED_TAGS_KEY, JSON.stringify(likedTags));
    }
  } catch (error) {
    console.error("Failed to save liked tag to local storage:", error);
  }
}

/**
 * Get all liked tags from local storage
 */
export function getLikedTags(): string[] {
  if (typeof window === "undefined") return [];
  
  try {
    const storedData = localStorage.getItem(LIKED_TAGS_KEY);
    return storedData ? JSON.parse(storedData) as string[] : [];
  } catch (error) {
    console.error("Failed to get liked tags from local storage:", error);
    return [];
  }
}

/**
 * Check if a tag has been liked
 */
export function isTagLiked(tag: string): boolean {
  if (typeof window === "undefined") return false;
  
  try {
    const likedTags = getLikedTags();
    return likedTags.includes(tag);
  } catch (error) {
    console.error("Failed to check if tag is liked:", error);
    return false;
  }
}

/**
 * Remove a tag from the liked list
 */
export function removeLikedTag(tag: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const likedTags = getLikedTags();
    const updatedTags = likedTags.filter(t => t !== tag);
    localStorage.setItem(LIKED_TAGS_KEY, JSON.stringify(updatedTags));
  } catch (error) {
    console.error("Failed to remove liked tag from local storage:", error);
  }
}


export function clearSkippedQuestions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SKIPPED_TAGS_KEY);
}

export function clearLikedQuestions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LIKED_TAGS_KEY);
}


export function clearSkippedTags(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SKIPPED_TAGS_KEY);
}
export function clearLikedTags(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LIKED_TAGS_KEY);
}


/**
 * Save an excluded tag to local storage
 */
export function saveBlockedTag(tag: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const excludedTags = getBlockedTags();
    if (!excludedTags.includes(tag)) {
      excludedTags.push(tag);
      localStorage.setItem(BLOCKED_TAGS_KEY, JSON.stringify(excludedTags));
    }
  } catch (error) {
    console.error("Failed to save blocked tag to local storage:", error);
  }
}

/**
 * Get all excluded tags from local storage
 */
export function getBlockedTags(): string[] {
  if (typeof window === "undefined") return [];
  
  try {
    const storedData = localStorage.getItem(BLOCKED_TAGS_KEY);
    return storedData ? JSON.parse(storedData) as string[] : [];
  } catch (error) {
    console.error("Failed to get blocked tags from local storage:", error);
    return [];
  }
}

/**
 * Check if a tag has been excluded
 */
export function isTagBlocked(tag: string): boolean {
  if (typeof window === "undefined") return false;
  
  try {
    const blockedTags = getBlockedTags();
    return blockedTags.includes(tag);
  } catch (error) {
    console.error("Failed to check if tag is blocked:", error);
    return false;
  }
}

/**
 * Remove a tag from the excluded list
 */
export function removeBlockedTag(tag: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const blockedTags = getBlockedTags();
    const updatedTags = blockedTags.filter(t => t !== tag);
    localStorage.setItem(BLOCKED_TAGS_KEY, JSON.stringify(updatedTags));
  } catch (error) {
    console.error("Failed to remove blocked tag from local storage:", error);
  }
}