import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AIModelsPage from './page';
import { useQuery, useMutation } from 'convex/react';

// Mocks
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock('../../../../convex/_generated/api', () => ({
  api: {
    admin: {
      aiModels: {
        getModels: 'getModels',
        createModel: 'createModel',
        updateModel: 'updateModel',
        deleteModel: 'deleteModel',
      }
    }
  },
}));

describe('AIModelsPage', () => {
  const mockModels = [
    { _id: 'm1', name: 'GPT-4o', identifier: 'openai/gpt-4o', provider: 'OpenRouter', isDefault: true },
    { _id: 'm2', name: 'Claude 3.5 Sonnet', identifier: 'anthropic/claude-3.5-sonnet', provider: 'OpenRouter', isDefault: false },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    (useQuery as any).mockImplementation((queryFn: any) => {
      if (queryFn === 'getModels') return mockModels;
      return undefined;
    });
    (useMutation as any).mockReturnValue(vi.fn());
  });

  it('renders models list', () => {
    render(<AIModelsPage />);
    expect(screen.getByText('AI Models')).toBeDefined();
    expect(screen.getByText('GPT-4o')).toBeDefined();
    expect(screen.getByText('Claude 3.5 Sonnet')).toBeDefined();
    expect(screen.getByText('openai/gpt-4o')).toBeDefined();
    expect(screen.getByText('anthropic/claude-3.5-sonnet')).toBeDefined();
    expect(screen.getByText('Default')).toBeDefined();
  });
});
