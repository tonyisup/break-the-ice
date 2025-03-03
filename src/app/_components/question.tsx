"use client";

import { useState, useEffect } from "react";
import { useSwipeable } from "react-swipeable";
import { api, RouterOutputs } from "~/trpc/react";
import { QuestionCard } from "./questionCard";
import { Button } from "~/components/ui/button";

type Question = NonNullable<RouterOutputs["questions"]["getRandom"]>;

export function QuestionComponent({ 
  initialQuestion 
}: { 
  initialQuestion: Question;
}) {
  const [currentQuestion, setCurrentQuestion] = useState(initialQuestion);
  const [nextQuestion, setNextQuestion] = useState<Question | null>(null);
  const utils = api.useUtils();

  const { refetch: fetchNewQuestion } = api.questions.getRandom.useQuery(
    undefined,
    {
      enabled: false, // Disable automatic fetching
    }
  );

  const fetchAndCacheNextQuestion = async () => {
    const newQuestionResult = await fetchNewQuestion();
    if (newQuestionResult.data) setNextQuestion(newQuestionResult.data);
  }

  // Fetch the next question when component mounts
  useEffect(() => {
    void fetchAndCacheNextQuestion();
  }, []);

  const showNextQuestion = async () => {
    if (nextQuestion) {
      setCurrentQuestion(nextQuestion);
      setNextQuestion(null);
      // Fetch the next question for future use
      void fetchAndCacheNextQuestion();
    } else {
      // Fallback in case next question isn't cached yet
      const newQuestionResult = await fetchNewQuestion();
      if (newQuestionResult.data) setCurrentQuestion(newQuestionResult.data);
      void fetchAndCacheNextQuestion();
    }
  }

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      void showNextQuestion();
    },
    onSwipedRight: () => {
      void showNextQuestion();
    },
    trackMouse: true,
    delta: 10, // min distance(px) before a swipe starts
    swipeDuration: 500, // allowable duration of a swipe (ms)
    touchEventOptions: { passive: true }
  });

  return (
    <div {...handlers} className="w-full max-w-2xl p-4 flex flex-col items-center justify-center gap-4">
      <QuestionCard question={currentQuestion.text} />
      <Button onClick={() => void showNextQuestion()}>Next Question</Button>
    </div>
  );
} 