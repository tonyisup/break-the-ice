import type { Question } from "~/app/_components/types";

const SKIPPED_QUESTIONS_KEY = "break-the-ice-skipped-questions";
const LIKED_QUESTIONS_KEY = "break-the-ice-liked-questions";
const SKIPPED_IDS_KEY = "break-the-ice-skipped-ids";
const LIKED_IDS_KEY = "break-the-ice-liked-ids";

/**
 * Save a skipped question to local storage
 */
export function saveSkippedQuestion(question: Question): void {
  if (typeof window === "undefined") return;
  
  try {
    // Save the full question object for backward compatibility
    const skippedQuestions = getSkippedQuestions();
    // Check if question already exists to avoid duplicates
    if (!skippedQuestions.some(q => q.id === question.id)) {
      skippedQuestions.push(question);
      localStorage.setItem(SKIPPED_QUESTIONS_KEY, JSON.stringify(skippedQuestions));
    }
    
    // Save just the ID
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
 * Get all skipped questions from local storage
 */
export function getSkippedQuestions(): Question[] {
  if (typeof window === "undefined") return [];
  
  try {
    const storedData = localStorage.getItem(SKIPPED_QUESTIONS_KEY);
    return storedData ? JSON.parse(storedData) as Question[] : [];
  } catch (error) {
    console.error("Failed to get skipped questions from local storage:", error);
    return [];
  }
}

/**
 * Get all skipped question IDs from local storage
 */
export function getSkippedIds(): string[] {
  if (typeof window === "undefined") return [];
  
  try {
    const storedData = localStorage.getItem(SKIPPED_IDS_KEY);
    return storedData ? JSON.parse(storedData) as string[] : [];
  } catch (error) {
    console.error("Failed to get skipped question IDs from local storage:", error);
    return [];
  }
}

/**
 * Check if a question has been skipped
 */
export function isQuestionSkipped(questionId: string): boolean {
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
export function removeSkippedQuestion(questionId: string): void {
  if (typeof window === "undefined") return;
  
  try {
    // Remove from full questions list for backward compatibility
    const skippedQuestions = getSkippedQuestions();
    const updatedQuestions = skippedQuestions.filter(q => q.id !== questionId);
    localStorage.setItem(SKIPPED_QUESTIONS_KEY, JSON.stringify(updatedQuestions));
    
    // Remove from IDs list
    const skippedIds = getSkippedIds();
    const updatedIds = skippedIds.filter(id => id !== questionId);
    localStorage.setItem(SKIPPED_IDS_KEY, JSON.stringify(updatedIds));
  } catch (error) {
    console.error("Failed to remove skipped question from local storage:", error);
  }
} 

export function clearSkippedQuestions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SKIPPED_QUESTIONS_KEY);
  localStorage.removeItem(SKIPPED_IDS_KEY);
}

/**
 * Save a liked question to local storage
 */
export function saveLikedQuestion(question: Question): void {
  if (typeof window === "undefined") return;

  try {
    // Save the full question object for backward compatibility
    const likedQuestions = getLikedQuestions();
    // Check if question already exists to avoid duplicates
    if (!likedQuestions.some(q => q.id === question.id)) {
      likedQuestions.push(question);
      localStorage.setItem(LIKED_QUESTIONS_KEY, JSON.stringify(likedQuestions));
    }
    
    // Save just the ID
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
 * Get all liked questions from local storage
 */
export function getLikedQuestions(): Question[] {
  if (typeof window === "undefined") return [];

  try {
    const storedData = localStorage.getItem(LIKED_QUESTIONS_KEY);
    return storedData ? JSON.parse(storedData) as Question[] : [];
  } catch (error) {
    console.error("Failed to get liked questions from local storage:", error);
    return [];
  }
}

/**
 * Get all liked question IDs from local storage
 */
export function getLikedIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const storedData = localStorage.getItem(LIKED_IDS_KEY);
    return storedData ? JSON.parse(storedData) as string[] : [];
  } catch (error) {
    console.error("Failed to get liked question IDs from local storage:", error);
    return [];
  }
}

/**
 * Check if a question has been liked
 */
export function isQuestionLiked(questionId: string): boolean {
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
export function removeLikedQuestion(questionId: string): void {
  if (typeof window === "undefined") return;

  try {
    // Remove from full questions list for backward compatibility
    const likedQuestions = getLikedQuestions();
    const updatedQuestions = likedQuestions.filter(q => q.id !== questionId);
    localStorage.setItem(LIKED_QUESTIONS_KEY, JSON.stringify(updatedQuestions));
    
    // Remove from IDs list
    const likedIds = getLikedIds();
    const updatedIds = likedIds.filter(id => id !== questionId);
    localStorage.setItem(LIKED_IDS_KEY, JSON.stringify(updatedIds));
  } catch (error) {
    console.error("Failed to remove liked question from local storage:", error);
  }
}

export function clearLikedQuestions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LIKED_QUESTIONS_KEY);
  localStorage.removeItem(LIKED_IDS_KEY);
}
