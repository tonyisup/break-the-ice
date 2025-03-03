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
  const [questionHistory, setQuestionHistory] = useState<Question[]>([initialQuestion]);
  const [historyIndex, setHistoryIndex] = useState(0);

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
      // Add current question to history if we're at the end
      if (historyIndex === questionHistory.length - 1) {
        setQuestionHistory([...questionHistory, nextQuestion]);
      } else {
        // Replace forward history with new path
        setQuestionHistory([
          ...questionHistory.slice(0, historyIndex + 1),
          nextQuestion
        ]);
      }
      setHistoryIndex(historyIndex + 1);
      setCurrentQuestion(nextQuestion);
      setNextQuestion(null);
      // Fetch the next question for future use
      void fetchAndCacheNextQuestion();
    } else {
      // Fallback in case next question isn't cached yet
      const newQuestionResult = await fetchNewQuestion();
      if (newQuestionResult.data) {
        if (historyIndex === questionHistory.length - 1) {
          setQuestionHistory([...questionHistory, newQuestionResult.data]);
        } else {
          setQuestionHistory([
            ...questionHistory.slice(0, historyIndex + 1),
            newQuestionResult.data
          ]);
        }
        setHistoryIndex(historyIndex + 1);
        setCurrentQuestion(newQuestionResult.data);
      }
      void fetchAndCacheNextQuestion();
    }
  }

  const showPreviousQuestion = () => {
    if (historyIndex > 0) {
      const previousIndex = historyIndex - 1;
      setHistoryIndex(previousIndex);
      setCurrentQuestion(questionHistory[previousIndex]!);
    }
  }

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      void showNextQuestion();
    },
    onSwipedRight: () => {
      showPreviousQuestion();
    },
    trackMouse: true,
    delta: 10, // min distance(px) before a swipe starts
    swipeDuration: 500, // allowable duration of a swipe (ms)
    touchEventOptions: { passive: true }
  });

  return (
    <div className="flex-1 h-full p-8 flex flex-col gap-8">
      <div {...handlers} className="flex-1 h-full flex flex-col items-center justify-center">
        <QuestionCard question={currentQuestion.text} />
      </div>
      <div className="flex justify-around gap-4">
        <Button 
          onClick={showPreviousQuestion}
          disabled={historyIndex === 0}
        >
          Previous
        </Button>
        <Button
          onClick={() => void showNextQuestion()}
        >
          Random
        </Button>
      </div>
    </div>
  );
} 