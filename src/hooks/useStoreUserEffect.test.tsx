import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStoreUserEffect } from './useStoreUserEffect';
import { useConvexAuth } from 'convex/react';
import { useUser } from '@clerk/clerk-react';
import { useMutation } from 'convex/react';

// Mock dependencies
vi.mock('convex/react', async () => {
    const actual = await vi.importActual('convex/react');
    return {
        ...actual,
        useConvexAuth: vi.fn(),
        useMutation: vi.fn(),
    };
});

vi.mock('@clerk/clerk-react', async () => {
    const actual = await vi.importActual('@clerk/clerk-react');
    return {
        ...actual,
        useUser: vi.fn(),
    };
});

const mockUseConvexAuth = useConvexAuth as vi.Mock;
const mockUseUser = useUser as vi.Mock;
const mockUseMutation = useMutation as vi.Mock;

describe('useStoreUserEffect', () => {
    const storeUserMock = vi.fn();

    beforeEach(() => {
        vi.resetAllMocks();
        mockUseMutation.mockReturnValue(storeUserMock);
    });

    it('should be in loading state when convex auth is loading', () => {
        mockUseConvexAuth.mockReturnValue({ isLoading: true, isAuthenticated: false });
        mockUseUser.mockReturnValue({ user: null });

        const { result } = renderHook(() => useStoreUserEffect());

        expect(result.current.isLoading).toBe(true);
        expect(result.current.isAuthenticated).toBe(false);
        expect(storeUserMock).not.toHaveBeenCalled();
    });

    it('should not be authenticated when convex auth is not authenticated', () => {
        mockUseConvexAuth.mockReturnValue({ isLoading: false, isAuthenticated: false });
        mockUseUser.mockReturnValue({ user: null });

        const { result } = renderHook(() => useStoreUserEffect());

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isAuthenticated).toBe(false);
        expect(storeUserMock).not.toHaveBeenCalled();
    });

    it('should be in loading state when user is authenticated but not yet stored', async () => {
        mockUseConvexAuth.mockReturnValue({ isLoading: false, isAuthenticated: true });
        mockUseUser.mockReturnValue({ user: { id: 'user1' } });
        storeUserMock.mockResolvedValue(null); // Not yet stored

        const { result } = renderHook(() => useStoreUserEffect());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(true);
        });

        expect(result.current.isAuthenticated).toBe(false);
        expect(storeUserMock).toHaveBeenCalled();
    });

    it('should be authenticated when user is authenticated and stored', async () => {
        mockUseConvexAuth.mockReturnValue({ isLoading: false, isAuthenticated: true });
        mockUseUser.mockReturnValue({ user: { id: 'user1' } });
        storeUserMock.mockResolvedValue('user_doc_id');

        const { result } = renderHook(() => useStoreUserEffect());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.isAuthenticated).toBe(true);
        expect(storeUserMock).toHaveBeenCalled();
    });
});
