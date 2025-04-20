import type { Question } from "@prisma/client"; 

const SKIPPED_IDS_KEY = "break-the-ice-skipped-ids";
const LIKED_IDS_KEY = "break-the-ice-liked-ids";
const SKIPPED_TAGS_KEY = "break-the-ice-skipped-tags";
const LIKED_TAGS_KEY = "break-the-ice-liked-tags";
const SKIPPED_CATEGORIES_KEY = "break-the-ice-skipped-categories";
const LIKED_CATEGORIES_KEY = "break-the-ice-liked-categories";
const SIMPLE_MODE_KEY = "break-the-ice-simple-mode";

/**
 * Save a skipped question to local storage
 */
export function saveSkippedQuestion(question: Question): void {
  if (typeof window === "undefined") return;
  
  try {
    const skippedIds = getSkippedIds();
    if (!skippedIds.includes(question.id)) {
      skippedIds.push(question.id);
      localStorage.setItem(SKIPPED_IDS_KEY, JSON.stringify(skippedIds));
    }
  } catch (error) {
    console.error("Failed to save skipped question to local storage:", error);
  }
}

/**
 * Get all skipped question IDs from local storage
 */
export function getSkippedIds(): number[] {
  if (typeof window === "undefined") return [];
  
  try {
    const skippedIds = localStorage.getItem(SKIPPED_IDS_KEY);
    return skippedIds ? (JSON.parse(skippedIds) as number[]) : [];
  } catch (error) {
    console.error("Failed to get skipped IDs from local storage:", error);
    return [];
  }
}

/**
 * Check if a question has been skipped
 */
export function isQuestionSkipped(questionId: number): boolean {
  if (typeof window === "undefined") return false;
  
  try {
    const skippedIds = getSkippedIds();
    return skippedIds.includes(questionId);
  } catch (error) {
    console.error("Failed to check if question is skipped:", error);
    return false;
  }
}

/**
 * Remove a question from the skipped list
 */
export function removeSkippedQuestion(questionId: number): void {
  if (typeof window === "undefined") return;

  try {
    const skippedIds = getSkippedIds();
    const updatedIds = skippedIds.filter(id => id !== questionId);
    localStorage.setItem(SKIPPED_IDS_KEY, JSON.stringify(updatedIds));
  } catch (error) {
    console.error("Failed to remove skipped question from local storage:", error);
  }
}

/**
 * Save a liked question to local storage
 */
export function saveLikedQuestion(question: Question): void {
  if (typeof window === "undefined") return;

  try {
    const likedIds = getLikedIds();
    if (!likedIds.includes(question.id)) {
      likedIds.push(question.id);
      localStorage.setItem(LIKED_IDS_KEY, JSON.stringify(likedIds));
    }
  } catch (error) {
    console.error("Failed to save liked question to local storage:", error);
  }
}

/**
 * Get all liked question IDs from local storage
 */
export function getLikedIds(): number[] {
  if (typeof window === "undefined") return [];
  
  try {
    const likedIds = localStorage.getItem(LIKED_IDS_KEY);
    return likedIds ? (JSON.parse(likedIds) as number[]) : [];
  } catch (error) {
    console.error("Failed to get liked IDs from local storage:", error);
    return [];
  }
}

/**
 * Check if a question has been liked
 */
export function isQuestionLiked(questionId: number): boolean {
  if (typeof window === "undefined") return false;

  try {
    const likedIds = getLikedIds();
    return likedIds.includes(questionId);
  } catch (error) {
    console.error("Failed to check if question is liked:", error);
    return false;
  }
}

/**
 * Remove a question from the liked list
 */
export function removeLikedQuestion(questionId: number): void {
  if (typeof window === "undefined") return;

  try {
    const likedIds = getLikedIds();
    const updatedIds = likedIds.filter(id => id !== questionId);
    localStorage.setItem(LIKED_IDS_KEY, JSON.stringify(updatedIds));
  } catch (error) {
    console.error("Failed to remove liked question from local storage:", error);
  }
}

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

/**
 * Save a skipped category to local storage
 */
export function saveSkippedCategory(category: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const skippedCategories = getSkippedCategories();
    if (!skippedCategories.includes(category)) {
      skippedCategories.push(category);
      localStorage.setItem(SKIPPED_CATEGORIES_KEY, JSON.stringify(skippedCategories));
    }
  } catch (error) {
    console.error("Failed to save skipped category to local storage:", error);
  }
}

/**
 * Get all skipped categories from local storage
 */
export function getSkippedCategories(): string[] {
  if (typeof window === "undefined") return [];
  
  try {
    const storedData = localStorage.getItem(SKIPPED_CATEGORIES_KEY);
    return storedData ? JSON.parse(storedData) as string[] : [];
  } catch (error) {
    console.error("Failed to get skipped categories from local storage:", error);
    return [];
  }
}

/**
 * Check if a category has been skipped
 */
export function isCategorySkipped(category: string): boolean {
  if (typeof window === "undefined") return false;
  
  try {
    const skippedCategories = getSkippedCategories();
    return skippedCategories.includes(category);
  } catch (error) {
    console.error("Failed to check if category is skipped:", error);
    return false;
  }
}

/**
 * Remove a category from the skipped list
 */
export function removeSkippedCategory(category: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const skippedCategories = getSkippedCategories();
    const updatedCategories = skippedCategories.filter(c => c !== category);
    localStorage.setItem(SKIPPED_CATEGORIES_KEY, JSON.stringify(updatedCategories));
  } catch (error) {
    console.error("Failed to remove skipped category from local storage:", error);
  }
}

/**
 * Save a liked category to local storage
 */
export function saveLikedCategory(category: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const likedCategories = getLikedCategories();
    if (!likedCategories.includes(category)) {
      likedCategories.push(category);
      localStorage.setItem(LIKED_CATEGORIES_KEY, JSON.stringify(likedCategories));
    }
  } catch (error) {
    console.error("Failed to save liked category to local storage:", error);
  }
}

/**
 * Get all liked categories from local storage
 */
export function getLikedCategories(): string[] {
  if (typeof window === "undefined") return [];
  
  try {
    const storedData = localStorage.getItem(LIKED_CATEGORIES_KEY);
    return storedData ? JSON.parse(storedData) as string[] : [];
  } catch (error) {
    console.error("Failed to get liked categories from local storage:", error);
    return [];
  }
}

/**
 * Check if a category has been liked
 */
export function isCategoryLiked(category: string): boolean {
  if (typeof window === "undefined") return false;
  
  try {
    const likedCategories = getLikedCategories();
    return likedCategories.includes(category);
  } catch (error) {
    console.error("Failed to check if category is liked:", error);
    return false;
  }
}

/**
 * Remove a category from the liked list
 */
export function removeLikedCategory(category: string): void {
  if (typeof window === "undefined") return;
  
  try {
    const likedCategories = getLikedCategories();
    const updatedCategories = likedCategories.filter(c => c !== category);
    localStorage.setItem(LIKED_CATEGORIES_KEY, JSON.stringify(updatedCategories));
  } catch (error) {
    console.error("Failed to remove liked category from local storage:", error);
  }
}

export function clearSkippedQuestions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SKIPPED_IDS_KEY);
  localStorage.removeItem(SKIPPED_TAGS_KEY);
  localStorage.removeItem(SKIPPED_CATEGORIES_KEY);
}

export function clearLikedQuestions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LIKED_IDS_KEY);
  localStorage.removeItem(LIKED_TAGS_KEY);
  localStorage.removeItem(LIKED_CATEGORIES_KEY);
}

export function clearSkippedCategories(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SKIPPED_CATEGORIES_KEY);
} 

export function clearSkippedTags(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SKIPPED_TAGS_KEY);
}

export function clearLikedCategories(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LIKED_CATEGORIES_KEY);
}

export function clearLikedTags(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LIKED_TAGS_KEY);
}

/**
 * Save the simple mode setting to local storage
 */
export function saveSimpleMode(simpleMode: boolean): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(SIMPLE_MODE_KEY, JSON.stringify(simpleMode));
  } catch (error) {
    console.error("Failed to save simple mode to local storage:", error);
  }
}

/**
 * Get the simple mode setting from local storage
 */
export function getSimpleMode(): boolean {
  if (typeof window === "undefined") return true;
  
  try {
    const simpleMode = localStorage.getItem(SIMPLE_MODE_KEY);
    return simpleMode ? JSON.parse(simpleMode) as boolean : true;
  } catch (error) {
    console.error("Failed to get simple mode from local storage:", error);
    return true;
  }
}





