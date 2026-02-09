import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import GeneratorPage from './page';
import { useQuery, useMutation, useAction } from 'convex/react';

// Mocks
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
}));

vi.mock('../../../../convex/_generated/api', () => ({
  api: {
    core: {
      styles: { getStyles: 'getStyles' },
      tones: { getTones: 'getTones' },
      topics: { getTopics: 'getTopics' },
      tags: { getTags: 'getTags' },
      ai: { generateAIQuestions: 'generateAIQuestions' },
      questions: { saveAIQuestion: 'saveAIQuestion' },
    }
  },
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('GeneratorPage', () => {
  const mockStyles = [{ _id: 's1', id: 'style-1', name: 'Style 1' }];
  const mockTones = [{ _id: 't1', id: 'tone-1', name: 'Tone 1' }];
  const mockTopics = [{ _id: 'top1', id: 'topic-1', name: 'Topic 1' }];
  const mockTags = [{ _id: 'tag1', name: 'tag1', grouping: 'group1' }];

  beforeEach(() => {
    vi.resetAllMocks();
    (useQuery as any).mockImplementation((queryFn: any) => {
      if (queryFn === 'getStyles') return mockStyles;
      if (queryFn === 'getTones') return mockTones;
      if (queryFn === 'getTopics') return mockTopics;
      if (queryFn === 'getTags') return mockTags;
      return undefined;
    });
    (useMutation as any).mockReturnValue(vi.fn());
    (useAction as any).mockReturnValue(vi.fn());
  });

  it('renders correctly with topics and tags', () => {
    render(<GeneratorPage />);
    expect(screen.getByText('AI Generator')).toBeDefined();
    expect(screen.getByText('Topic')).toBeDefined();
    expect(screen.getByText('Topic 1')).toBeDefined();
    expect(screen.getByText('Tags')).toBeDefined();
    // Use getAllByText for 'group1' because it appears in both the button and the grouping label
    expect(screen.getAllByText(/group1/i)).toBeDefined();
  });
});
