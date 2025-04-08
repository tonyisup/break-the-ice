import type { Question } from "~/app/_components/types";

const SKIPPED_QUESTIONS_KEY = "break-the-ice-skipped-questions";
const LIKED_QUESTIONS_KEY = "break-the-ice-liked-questions";

/**
 * Save a skipped question to local storage
 */
export function saveSkippedQuestion(question: Question): void {
  if (typeof window === "undefined") return;
  
  try {
    const skippedQuestions = getSkippedQuestions();
    // Check if question already exists to avoid duplicates
    if (!skippedQuestions.some(q => q.id === question.id)) {
      skippedQuestions.push(question);
      localStorage.setItem(SKIPPED_QUESTIONS_KEY, JSON.stringify(skippedQuestions));
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
 * Check if a question has been skipped
 */
export function isQuestionSkipped(questionId: string): boolean {
  if (typeof window === "undefined") return false;
  
  try {
    const skippedQuestions = getSkippedQuestions();
    return skippedQuestions.some(q => q.id === questionId);
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
    const skippedQuestions = getSkippedQuestions();
    const updatedQuestions = skippedQuestions.filter(q => q.id !== questionId);
    localStorage.setItem(SKIPPED_QUESTIONS_KEY, JSON.stringify(updatedQuestions));
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
    const likedQuestions = getLikedQuestions();
    // Check if question already exists to avoid duplicates
    if (!likedQuestions.some(q => q.id === question.id)) {
      likedQuestions.push(question);
      localStorage.setItem(LIKED_QUESTIONS_KEY, JSON.stringify(likedQuestions));
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
 * Check if a question has been liked
 */
export function isQuestionLiked(questionId: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    const likedQuestions = getLikedQuestions();
    return likedQuestions.some(q => q.id === questionId);
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
    const likedQuestions = getLikedQuestions();
    const updatedQuestions = likedQuestions.filter(q => q.id !== questionId);
    localStorage.setItem(LIKED_QUESTIONS_KEY, JSON.stringify(updatedQuestions));
  } catch (error) {
    console.error("Failed to remove liked question from local storage:", error);
  }
}
