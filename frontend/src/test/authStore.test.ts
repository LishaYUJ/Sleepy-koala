import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, CustomApiError, NetworkApiError, ServerWakeTimeoutError } from '../services/api';
import { useStore } from '../stores/useStore';

const authResponse = {
  token: 'token',
  userId: 'user-id',
  email: 'koala@example.com',
  nickname: 'Koala',
  avatarDataUrl: null,
};

const summaryResponse = {
  todayCheckedIn: false,
  todayStatus: null,
  currentStreak: 0,
  longestStreak: 0,
  koalaMood: 'ENJOYING_LIFE',
  consecutiveBadDays: 0,
  fatigueScore: 0,
  fatigueState: 'healthy',
  cutoffTime: '22:00',
  badges: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  useStore.setState({
    token: null,
    userId: null,
    email: null,
    nickname: null,
    isLoading: false,
    isWakingServer: false,
    authPhase: 'idle',
    authErrorKind: null,
    error: null,
    summary: null,
    history: [],
  });
});

describe('API error messages', () => {
  it('turns ASP.NET validation details into a useful message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      title: 'One or more validation errors occurred.',
      errors: {
        Password: ['Password must be at least 6 characters.'],
      },
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(api.post('/api/auth/register', {})).rejects.toMatchObject({
      body: {
        error: 'ValidationError',
        message: 'Password must be at least 6 characters.',
      },
    });
  });
});

describe('idempotent registration recovery', () => {
  it('retries a disconnected registration with the same attempt ID', async () => {
    vi.spyOn(api, 'waitUntilReady').mockResolvedValue();
    vi.spyOn(api, 'waitBeforeRetry').mockResolvedValue();
    const post = vi.spyOn(api, 'post')
      .mockRejectedValueOnce(new NetworkApiError())
      .mockResolvedValueOnce(authResponse);
    vi.spyOn(api, 'get').mockResolvedValue(summaryResponse);

    await useStore.getState().register(
      'koala@example.com',
      'Password123!',
      'Koala',
      'attempt-123',
    );

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
    expect(post.mock.calls[1][1]).toMatchObject({ registrationAttemptId: 'attempt-123' });
    expect(useStore.getState().authErrorKind).toBeNull();
  });

  it('does not send registration details when the initial health check times out', async () => {
    vi.spyOn(api, 'waitUntilReady').mockRejectedValue(new ServerWakeTimeoutError());
    const post = vi.spyOn(api, 'post');

    await expect(useStore.getState().register(
      'koala@example.com',
      'Password123!',
      'Koala',
      'attempt-123',
    )).rejects.toThrow('connect to the server');

    expect(post).not.toHaveBeenCalled();
    expect(useStore.getState().authErrorKind).toBe('wake-timeout');
    expect(useStore.getState().error).toBe('We couldn’t connect to the server. Please try again.');
  });

  it('shows an unconfirmed result when recovery reaches the final deadline', async () => {
    vi.spyOn(api, 'waitUntilReady')
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new ServerWakeTimeoutError());
    vi.spyOn(api, 'waitBeforeRetry').mockResolvedValue();
    vi.spyOn(api, 'post').mockRejectedValue(new NetworkApiError());

    await expect(useStore.getState().register(
      'koala@example.com',
      'Password123!',
      'Koala',
      'attempt-123',
    )).rejects.toThrow('complete registration');

    expect(useStore.getState().authErrorKind).toBe('registration-unconfirmed');
    expect(useStore.getState().error).toBe('We couldn’t complete registration. Please try again.');
  });

  it('automatically retries a transient gateway response', async () => {
    vi.spyOn(api, 'waitUntilReady').mockResolvedValue();
    vi.spyOn(api, 'waitBeforeRetry').mockResolvedValue();
    const post = vi.spyOn(api, 'post')
      .mockRejectedValueOnce(new CustomApiError(503, {
        error: 'ServiceUnavailable',
        message: 'Service unavailable.',
      }))
      .mockResolvedValueOnce(authResponse);
    vi.spyOn(api, 'get').mockResolvedValue(summaryResponse);

    await useStore.getState().register(
      'koala@example.com',
      'Password123!',
      'Koala',
      'attempt-123',
    );

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
  });
});

describe('check-in history synchronization', () => {
  it('reloads both the summary and history after a successful check-in', async () => {
    const historyEntry = {
      id: 'check-in-id',
      localCheckInDate: '2026-10-09',
      status: 'late',
      recorded: true,
      checkedInAtUtc: '2026-10-09T12:20:00Z',
    };

    useStore.setState({ token: 'token', history: [] });
    vi.spyOn(api, 'post').mockResolvedValue({
      checkInId: historyEntry.id,
      localCheckInDate: historyEntry.localCheckInDate,
      status: historyEntry.status,
    });
    const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/me/summary') return summaryResponse as any;
      if (url === '/api/checkins/me') return [historyEntry] as any;
      throw new Error(`Unexpected API request: ${url}`);
    });

    await useStore.getState().performCheckIn();

    expect(get).toHaveBeenCalledWith('/api/me/summary', 'token');
    expect(get).toHaveBeenCalledWith('/api/checkins/me', 'token');
    expect(useStore.getState().history).toEqual([historyEntry]);
  });
});
