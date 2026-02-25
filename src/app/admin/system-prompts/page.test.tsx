import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemPromptsPage from './page';
import { useQuery, useMutation } from 'convex/react';

// Mocks
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock('../../../../convex/_generated/api', () => ({
  api: {
    admin: {
      systemPrompts: {
        getPrompts: 'getPrompts',
        createPrompt: 'createPrompt',
        updatePrompt: 'updatePrompt',
        deletePrompt: 'deletePrompt',
      }
    }
  },
}));

describe('SystemPromptsPage', () => {
  const mockPrompts = [
    { _id: 'p1', name: 'Standard V1', content: 'You are a helpful assistant...', isDefault: true },
    { _id: 'p2', name: 'Creative V1', content: 'You are a creative writer...', isDefault: false },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    (useQuery as any).mockImplementation((queryFn: any) => {
      if (queryFn === 'getPrompts') return mockPrompts;
      return undefined;
    });
    (useMutation as any).mockReturnValue(vi.fn());
  });

  it('renders prompts list', () => {
    render(<SystemPromptsPage />);
    expect(screen.getByText('System Prompts')).toBeDefined();
    expect(screen.getByText('Standard V1')).toBeDefined();
    expect(screen.getByText('Creative V1')).toBeDefined();
    expect(screen.getByText('You are a helpful assistant...')).toBeDefined();
    expect(screen.getByText('Default')).toBeDefined();
  });
});
