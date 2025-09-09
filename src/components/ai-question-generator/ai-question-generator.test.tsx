import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { AIQuestionGenerator } from './ai-question-generator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../convex/_generated/api', () => ({
  api: {
    models: { getModels: {} },
    styles: { getStyles: {} },
    tones: { getTones: {} },
    tags: { getTags: {} },
    ai: { generateAIQuestion: {} },
    questions: { saveAIQuestion: {} },
    categories: { initializeCategories: {} },
  },
}));
import { api } from '../../../convex/_generated/api';

import { useQuery, useAction, useMutation, ReactMutation } from 'convex/react';
import { FunctionReference } from 'convex/server';
vi.mock('convex/react', () => ({ useQuery: vi.fn(), useAction: vi.fn(), useMutation: vi.fn() }));

describe('AIQuestionGenerator', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockImplementation((query: any, ...args: any[]) => {
      switch (query) {
        case (api as any).models.getModels:
          return [{ id: 'm1', name: 'Model 1' }] as any;
        case (api as any).styles.getStyles:
          return [{ id: 's1', name: 'Casual' }] as any;
        case (api as any).tones.getTones:
          return [{ id: 't1', name: 'Happy' }] as any;
        case (api as any).tags.getTags:
          return [
            { _id: 'tag1', name: 'fun', category: 'general' },
            { _id: 'tag2', name: 'work', category: 'general' },
          ] as any;
        default:
          return undefined as any;
      }
    });
    vi.mocked(useAction).mockReturnValue(async () => ({ text: 'Generated Q', tags: ['fun'] }) as any);
    // For useMutation we may have multiple calls; just return a resolved function each time
    vi.mocked(useMutation).mockImplementation(
      (mutationRef: FunctionReference<"mutation">): ReactMutation<FunctionReference<"mutation">> => {
      if (mutationRef === (api as any).questions.saveAIQuestion) {
        return vi.fn(() => Promise.resolve({ 
          _id: 'newQ', 
          text: 'Generated Q',
          style: 's1', 
          tone: 't1', 
        })) as any;
      }
      return vi.fn(() => Promise.resolve({})) as any;
    });
  });

  it('disables generate when no tags, enables after selecting tags, and accepts', async () => {
    const onQuestionGenerated = vi.fn();
    const onClose = vi.fn();
    render(
      <AIQuestionGenerator onQuestionGenerated={onQuestionGenerated} onClose={onClose} />
    );

    const generateBtn = screen.getByRole('button', { name: /generate question/i });
    expect(generateBtn).toBeDisabled();

    // expand all categories to ensure tags are visible
    await act(async () => {
      fireEvent.click(screen.getByText(/expand all/i));
    });

    // select a tag
    const funTag = await screen.findByText('fun');
    await act(async () => {
      fireEvent.click(funTag);
    });

    // select a style
    const casualStyle = await screen.findByText('Casual');
    await act(async () => {
      fireEvent.click(casualStyle);
    });

    // select a tone
    const happyTone = await screen.findByText('Happy');
    await act(async () => {
      fireEvent.click(happyTone);
    });

    expect(screen.getByRole('button', { name: /generate question/i })).toBeEnabled();

    // generate preview
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate question/i }));
    });

    // Accept button appears after preview
    // Click Accept
    const acceptBtn = await screen.findByRole('button', { name: /accept/i });
    await act(async () => {
      fireEvent.click(acceptBtn);
    });

    // saving is async; wait for callback
    await vi.waitFor(() => {
      expect(onQuestionGenerated).toHaveBeenCalled();
    });
    
    // Check what was actually called
    expect(onQuestionGenerated).toHaveBeenCalledWith({
      _id: 'newQ', 
      text: 'Generated Q',
      style: 's1', 
      tone: 't1', 
    });
  });
});

