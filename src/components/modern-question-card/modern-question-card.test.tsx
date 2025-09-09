import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { ModernQuestionCard } from './modern-question-card';

const question = {
  _id: 'q1',
  _creationTime: Date.now(),
  text: 'What is your favorite book?',
  style: 'Casual',
  tone: 'Happy',
} as any;

describe('ModernQuestionCard', () => {
  it('shows loading spinner when isGenerating is true', () => {
    render(
      <ModernQuestionCard
        question={null}
        isGenerating={true}
        isFavorite={false}
        onToggleFavorite={() => {}}
      />
    );
    expect(screen.getByText(/generating question/i)).toBeInTheDocument();
  });

  it('renders question content when not generating', () => {
    render(
      <ModernQuestionCard
        question={question}
        isGenerating={false}
        isFavorite={false}
        onToggleFavorite={() => {}}
      />
    );
    expect(screen.getByText(question.text)).toBeInTheDocument();
    expect(screen.getByText(question.style)).toBeInTheDocument();
    expect(screen.getByText(question.tone)).toBeInTheDocument();
  });

  it('triggers onToggleFavorite when heart button is clicked', () => {
    const onToggleFavorite = vi.fn();
    render(
      <ModernQuestionCard
        question={question}
        isGenerating={false}
        isFavorite={false}
        onToggleFavorite={onToggleFavorite}
      />
    );
    const btn = screen.getByTitle('Toggle favorite');
    fireEvent.click(btn);
    expect(onToggleFavorite).toHaveBeenCalled();
  });

  it('conditionally renders share button only when navigator.share exists', () => {
    const originalShare = (navigator as any).share;
    (navigator as any).share = undefined;
    const { rerender } = render(
      <ModernQuestionCard
        question={question}
        isGenerating={false}
        isFavorite={false}
        onToggleFavorite={() => {}}
      />
    );
    expect(screen.queryByTitle('Share question')).not.toBeInTheDocument();

    (navigator as any).share = vi.fn();
    rerender(
      <ModernQuestionCard
        question={question}
        isGenerating={false}
        isFavorite={false}
        onToggleFavorite={() => {}}
      />
    );
    expect(screen.getByTitle('Share question')).toBeInTheDocument();
    (navigator as any).share = originalShare;
  });
});

