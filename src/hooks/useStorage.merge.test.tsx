import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMutation, useQuery } from 'convex/react';
import { useConvexStorageContext } from './useStorage';

vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

let mockActiveWorkspace: string | null = null;
vi.mock('./useWorkspace', () => ({
  useWorkspace: () => ({ activeWorkspace: mockActiveWorkspace }),
}));

vi.mock('../../convex/_generated/api', () => ({
  api: {
    core: {
      userSettings: {
        getQuestionHistory: 'getQuestionHistory',
        getSettings: 'getSettings',
        updateLikedQuestions: 'updateLikedQuestions',
        updateHiddenQuestions: 'updateHiddenQuestions',
        updateUserSettings: 'updateUserSettings',
        mergeKnownLikedQuestions: 'mergeKnownLikedQuestions',
        mergeKnownHiddenQuestions: 'mergeKnownHiddenQuestions',
        mergeQuestionHistory: 'mergeQuestionHistory',
        getHiddenStyleIds: 'getHiddenStyleIds',
        getHiddenToneIds: 'getHiddenToneIds',
        updateHiddenStyles: 'updateHiddenStyles',
        updateHiddenTones: 'updateHiddenTones',
        addHiddenStyleId: 'addHiddenStyleId',
        removeHiddenStyleId: 'removeHiddenStyleId',
        addHiddenToneId: 'addHiddenToneId',
        removeHiddenToneId: 'removeHiddenToneId',
      },
    },
  },
}));

const mutations: Record<string, Mock> = {};

describe('useConvexStorageContext sign-in merge', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    mockActiveWorkspace = null;
    for (const key of Object.keys(mutations)) delete mutations[key];
    (useQuery as Mock).mockReturnValue(undefined);
    (useMutation as Mock).mockImplementation((name: string) => {
      mutations[name] ??= vi.fn().mockResolvedValue(null);
      return mutations[name];
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges local likes, hidden questions and history into the personal workspace, then clears them', async () => {
    mockActiveWorkspace = 'org1';
    localStorage.setItem('likedQuestions', JSON.stringify(['q1', 42, null, 'q2']));
    localStorage.setItem('hiddenQuestions', JSON.stringify(['q3']));
    localStorage.setItem('questionHistory', JSON.stringify([
      { question: { _id: 'q4' }, viewedAt: 1000 },
      { question: null, viewedAt: 5 },
      { viewedAt: 7 },
      null,
      { question: { _id: 'q5' }, viewedAt: 'yesterday' },
    ]));

    renderHook(() => useConvexStorageContext(true));

    await waitFor(() => expect(localStorage.getItem('questionHistory')).toBeNull());
    expect(mutations.mergeKnownLikedQuestions).toHaveBeenCalledWith({ likedQuestions: ['q1', 'q2'] });
    expect(mutations.mergeKnownHiddenQuestions).toHaveBeenCalledWith({ hiddenQuestions: ['q3'] });
    expect(mutations.mergeQuestionHistory).toHaveBeenCalledWith({
      history: [{ questionId: 'q4', viewedAt: 1000 }],
    });
    expect(localStorage.getItem('likedQuestions')).toBeNull();
    expect(localStorage.getItem('hiddenQuestions')).toBeNull();
  });

  it('keeps a local list when its merge fails and still merges the others', async () => {
    localStorage.setItem('likedQuestions', JSON.stringify(['q1']));
    localStorage.setItem('hiddenQuestions', JSON.stringify(['q2']));
    (useMutation as Mock).mockImplementation((name: string) => {
      mutations[name] ??= name === 'mergeKnownLikedQuestions'
        ? vi.fn().mockRejectedValue(new Error('offline'))
        : vi.fn().mockResolvedValue(null);
      return mutations[name];
    });

    renderHook(() => useConvexStorageContext(true));

    await waitFor(() => expect(localStorage.getItem('hiddenQuestions')).toBeNull());
    expect(mutations.mergeKnownLikedQuestions).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('likedQuestions')).toBe(JSON.stringify(['q1']));
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('keeping it for the next visit'),
      expect.any(Error),
    );
  });

  it('skips unreadable or empty local lists without calling the server', async () => {
    localStorage.setItem('likedQuestions', '{not json');
    localStorage.setItem('hiddenQuestions', '[]');
    localStorage.setItem('questionHistory', JSON.stringify({ not: 'a list' }));

    renderHook(() => useConvexStorageContext(true));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mutations.mergeKnownLikedQuestions).not.toHaveBeenCalled();
    expect(mutations.mergeKnownHiddenQuestions).not.toHaveBeenCalled();
    expect(mutations.mergeQuestionHistory).not.toHaveBeenCalled();
    expect(localStorage.getItem('likedQuestions')).toBe('{not json');
  });

  it('keeps a local list that changed while its merge was pending', async () => {
    localStorage.setItem('likedQuestions', JSON.stringify(['q1']));
    let finish!: () => void;
    (useMutation as Mock).mockImplementation((name: string) => {
      mutations[name] ??= name === 'mergeKnownLikedQuestions'
        ? vi.fn(() => new Promise<null>((resolve) => { finish = () => resolve(null); }))
        : vi.fn().mockResolvedValue(null);
      return mutations[name];
    });

    renderHook(() => useConvexStorageContext(true));
    await waitFor(() => expect(mutations.mergeKnownLikedQuestions).toHaveBeenCalledTimes(1));

    // A sign-out or another tab adds a like the pending merge never sent.
    localStorage.setItem('likedQuestions', JSON.stringify(['q1', 'q2']));
    finish();

    // Let the merge's continuation run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(localStorage.getItem('likedQuestions')).toBe(JSON.stringify(['q1', 'q2']));
  });

  it('does not start a second merge while one is in flight (StrictMode re-runs the effect)', async () => {
    localStorage.setItem('likedQuestions', JSON.stringify(['q1']));
    let finish!: () => void;
    (useMutation as Mock).mockImplementation((name: string) => {
      mutations[name] ??= name === 'mergeKnownLikedQuestions'
        ? vi.fn(() => new Promise<null>((resolve) => { finish = () => resolve(null); }))
        : vi.fn().mockResolvedValue(null);
      return mutations[name];
    });

    // StrictMode mounts, cleans up and re-runs the effect while the first merge is pending.
    renderHook(() => useConvexStorageContext(true), { reactStrictMode: true });
    await waitFor(() => expect(mutations.mergeKnownLikedQuestions).toHaveBeenCalled());
    expect(mutations.mergeKnownLikedQuestions).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(localStorage.getItem('likedQuestions')).toBeNull());
    expect(mutations.mergeKnownLikedQuestions).toHaveBeenCalledTimes(1);
  });
});
