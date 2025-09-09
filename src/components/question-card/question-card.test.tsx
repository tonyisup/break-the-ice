import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QuestionCard } from './question-card';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useTheme', () => ({ useThemeListener: () => 'light' }));

const currentQuestion = {
  _id: 'q1',
  _creationTime: Date.now(),
  text: 'Double click to like',
} as any;

describe('QuestionCard', () => {
  it('renders question text', () => {
    render(
      <QuestionCard
        currentQuestion={currentQuestion}
        liked={false}
        handleDiscard={async () => {}}
        toggleLike={async () => {}}
      />
    );
    expect(screen.getByText('Double click to like')).toBeInTheDocument();
  });

  it('toggles like on button click', async () => {
    const toggleLike = vi.fn().mockResolvedValue(undefined);
    render(
      <QuestionCard
        currentQuestion={currentQuestion}
        liked={false}
        handleDiscard={async () => {}}
        toggleLike={toggleLike}
      />
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(toggleLike).toHaveBeenCalled();
  });
});

