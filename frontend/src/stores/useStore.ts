import { create } from 'zustand';
import {
  api,
  CustomApiError,
  NetworkApiError,
  ServerWakeTimeoutError,
} from '../services/api';

export type AuthPhase = 'idle' | 'waking' | 'submitting' | 'recovering';
export type AuthErrorKind =
  | 'wake-timeout'
  | 'connection'
  | 'registration-unconfirmed'
  | 'user-exists'
  | 'attempt-conflict'
  | 'server-response';

class RegistrationUnconfirmedError extends Error {
  constructor() {
    super('We couldn’t complete registration. Please try again.');
    this.name = 'RegistrationUnconfirmedError';
  }
}

class RegistrationUnavailableError extends Error {
  constructor() {
    super('We couldn’t connect to the server. Please try again.');
    this.name = 'RegistrationUnavailableError';
  }
}

const registrationFlowTimeoutMs = 180_000;
const transientRegistrationStatuses = new Set([502, 503, 504]);

function isTransientRegistrationError(error: unknown): boolean {
  return error instanceof NetworkApiError
    || (error instanceof CustomApiError && transientRegistrationStatuses.has(error.status));
}

function logAuthEvent(message: string, details?: Record<string, unknown>): void {
  if (import.meta.env.MODE !== 'test') {
    console.info(`[auth] ${message}`, details ?? '');
  }
}

export interface Badge {
  name: string;
  description: string;
  unlockedAt?: string;
}

export interface UserSummary {
  todayCheckedIn: boolean;
  todayStatus: string | null;
  currentStreak: int;
  longestStreak: int;
  koalaMood: string;
  consecutiveBadDays: number;
  fatigueScore: number;
  fatigueState: 'healthy' | 'weak' | 'veryWeak';
  cutoffTime: string;
  badges: Badge[];
}

export interface CheckInHistory {
  id: string | null;
  localCheckInDate: string;
  status: string;
  recorded: boolean;
  checkedInAtUtc: string | null;
}

export interface LeaderRank {
  rank: number;
  nickname: string;
  currentStreak: number;
}

export interface BadgesSummary {
  unlocked: Badge[];
  locked: Badge[];
}

export interface UserSettingsDto {
  nickname: string;
  cutoffTime: string;
  onboardingCompleted: boolean;
  timeZoneId: string;
  avatarDataUrl?: string | null;
}

interface AppState {
  // Session State
  token: string | null;
  userId: string | null;
  email: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  onboardingCompleted: boolean | null;
  isLoading: boolean;
  isWakingServer: boolean;
  authPhase: AuthPhase;
  authErrorKind: AuthErrorKind | null;
  error: string | null;

  // Domain State
  summary: UserSummary | null;
  history: CheckInHistory[];
  leaderboard: LeaderRank[];
  badges: BadgesSummary | null;

  // Actions
  setError: (msg: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string, registrationAttemptId: string) => Promise<void>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  loadSummary: (localDateString?: string) => Promise<void>;
  performCheckIn: () => Promise<any>;
  loadHistory: () => Promise<void>;
  loadLeaderboard: () => Promise<void>;
  loadBadges: () => Promise<void>;
  updateSettings: (dto: UserSettingsDto) => Promise<void>;
  loadSettings: () => Promise<UserSettingsDto | null>;
}

// Helper to get local date string yyyy-MM-dd
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get local time string HH:mm
export function getLocalTimeString(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getCurrentSleepDateString(date: Date = new Date()): string {
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const windowStartMinutes = 21 * 60;

  if (currentMinutes < windowStartMinutes) {
    const previous = new Date(date);
    previous.setDate(previous.getDate() - 1);
    return getLocalDateString(previous);
  }

  return getLocalDateString(date);
}

export const useStore = create<AppState>((set, get) => ({
  token: localStorage.getItem('token'),
  userId: localStorage.getItem('userId'),
  email: localStorage.getItem('email'),
  nickname: localStorage.getItem('nickname'),
  avatarUrl: localStorage.getItem('avatarUrl'),
  onboardingCompleted: null,
  isLoading: false,
  isWakingServer: false,
  authPhase: 'idle',
  authErrorKind: null,
  error: null,
  summary: null,
  history: [],
  leaderboard: [],
  badges: null,

  setError: (msg) => set({
    error: msg,
    ...(msg === null ? { authErrorKind: null } : {}),
  }),

  login: async (email, password) => {
    set({
      isLoading: true,
      isWakingServer: true,
      authPhase: 'waking',
      authErrorKind: null,
      error: null,
    });
    try {
      await api.waitUntilReady();
      set({ isWakingServer: false, authPhase: 'submitting' });
      const response: any = await api.post('/api/auth/login', { email, password });
      
      localStorage.setItem('token', response.token);
      localStorage.setItem('userId', response.userId);
      localStorage.setItem('email', response.email);
      localStorage.setItem('nickname', response.nickname);
      if (response.avatarDataUrl) {
        localStorage.setItem('avatarUrl', response.avatarDataUrl);
      } else {
        localStorage.removeItem('avatarUrl');
      }
      
      set({
        token: response.token,
        userId: response.userId,
        email: response.email,
        nickname: response.nickname,
        avatarUrl: response.avatarDataUrl || null,
        onboardingCompleted: null,
        isLoading: false,
        isWakingServer: false,
        authPhase: 'idle',
        authErrorKind: null,
      });

      const sleepDate = getCurrentSleepDateString();
      await get().loadSummary(sleepDate);
    } catch (err: any) {
      const wakeTimedOut = err instanceof ServerWakeTimeoutError;
      const networkFailed = err instanceof NetworkApiError;
      set({
        isLoading: false,
        isWakingServer: false,
        authPhase: 'idle',
        authErrorKind: wakeTimedOut ? 'wake-timeout' : networkFailed ? 'connection' : 'server-response',
        error: wakeTimedOut
          ? 'We couldn’t connect to the server. Please try again.'
          : networkFailed
            ? 'The connection was interrupted while signing in. Please try again.'
            : err.body?.message || err.message,
      });
      throw err;
    }
  },

  register: async (email, password, nickname, registrationAttemptId) => {
    set({
      isLoading: true,
      isWakingServer: true,
      authPhase: 'waking',
      authErrorKind: null,
      error: null,
    });
    try {
      const deadline = Date.now() + registrationFlowTimeoutMs;
      const registration = { email, password, nickname, registrationAttemptId };
      let response: any = null;
      let registrationWasSent = false;
      let submissionCount = 0;
      logAuthEvent('registration flow started');

      while (Date.now() < deadline && response === null) {
        set({
          isWakingServer: true,
          authPhase: registrationWasSent ? 'recovering' : 'waking',
        });

        try {
          await api.waitUntilReady({ timeoutMs: deadline - Date.now() });
        } catch (error) {
          if (error instanceof ServerWakeTimeoutError) {
            break;
          }
          throw error;
        }

        set({ isWakingServer: false, authPhase: 'submitting' });
        submissionCount += 1;
        registrationWasSent = true;
        logAuthEvent('registration request sent', { submissionCount });

        try {
          response = await api.post('/api/auth/register', registration);
          logAuthEvent('registration completed', { submissionCount });
        } catch (error) {
          if (!isTransientRegistrationError(error)) {
            throw error;
          }

          logAuthEvent('registration request interrupted; recovering', {
            submissionCount,
            reason: error instanceof CustomApiError
              ? `HTTP ${error.status}`
              : error instanceof Error
                ? error.name
                : 'UnknownError',
          });
          if (Date.now() < deadline) {
            await api.waitBeforeRetry();
          }
        }
      }

      if (response === null) {
        throw registrationWasSent
          ? new RegistrationUnconfirmedError()
          : new RegistrationUnavailableError();
      }
      
      localStorage.setItem('token', response.token);
      localStorage.setItem('userId', response.userId);
      localStorage.setItem('email', response.email);
      localStorage.setItem('nickname', response.nickname);
      if (response.avatarDataUrl) {
        localStorage.setItem('avatarUrl', response.avatarDataUrl);
      } else {
        localStorage.removeItem('avatarUrl');
      }
      
      set({
        token: response.token,
        userId: response.userId,
        email: response.email,
        nickname: response.nickname,
        avatarUrl: response.avatarDataUrl || null,
        onboardingCompleted: null,
        isLoading: false,
        isWakingServer: false,
        authPhase: 'idle',
        authErrorKind: null,
      });

      const sleepDate = getCurrentSleepDateString();
      await get().loadSummary(sleepDate);
    } catch (err: any) {
      const wakeTimedOut = err instanceof ServerWakeTimeoutError;
      const unconfirmed = err instanceof RegistrationUnconfirmedError;
      const unavailable = err instanceof RegistrationUnavailableError;
      const apiError = err instanceof CustomApiError ? err.body.error : null;
      const authErrorKind: AuthErrorKind = wakeTimedOut
        ? 'wake-timeout'
        : unavailable
          ? 'wake-timeout'
          : unconfirmed
          ? 'registration-unconfirmed'
          : apiError === 'UserExists'
            ? 'user-exists'
            : apiError === 'IdempotencyConflict'
              ? 'attempt-conflict'
              : 'server-response';

      set({
        isLoading: false,
        isWakingServer: false,
        authPhase: 'idle',
        authErrorKind,
        error: wakeTimedOut || unavailable
          ? 'We couldn’t connect to the server. Please try again.'
          : apiError === 'IdempotencyConflict'
            ? 'Something changed during registration. Please submit again.'
            : err.body?.message || err.message,
      });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('email');
    localStorage.removeItem('nickname');
    localStorage.removeItem('avatarUrl');
    set({
      token: null,
      userId: null,
      email: null,
      nickname: null,
      avatarUrl: null,
      onboardingCompleted: null,
      summary: null,
      history: [],
      leaderboard: [],
      badges: null,
      isLoading: false,
      isWakingServer: false,
      authPhase: 'idle',
      authErrorKind: null,
      error: null
    });
  },

  deleteAccount: async () => {
    const { token } = get();
    if (!token) return;

    set({ isLoading: true, error: null });
    try {
      await api.delete('/api/account/me', token);
      get().logout();
    } catch (err: any) {
      set({ isLoading: false, error: err.body?.message || err.message });
      throw err;
    }
  },

  loadSummary: async (_localDateString) => {
    const { token } = get();
    if (!token) return;
    
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<UserSummary>('/api/me/summary', token);
      set({ summary: response, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.body?.message || err.message });
    }
  },

  performCheckIn: async () => {
    const { token } = get();
    if (!token) return;

    set({ isLoading: true, error: null });
    try {
      const localDate = getLocalDateString();
      const localTime = getLocalTimeString();
      const response: any = await api.post(
        '/api/checkins',
        { localDate, localTime },
        token
      );
      set({ isLoading: false });
      
      // Keep both dashboard and history views in sync with the completed check-in.
      await Promise.all([
        get().loadSummary(response.localCheckInDate || getCurrentSleepDateString()),
        get().loadHistory(),
      ]);
      return response;
    } catch (err: any) {
      set({ isLoading: false, error: err.body?.message || err.message });
      throw err;
    }
  },

  loadHistory: async () => {
    const { token } = get();
    if (!token) return;

    set({ isLoading: true, error: null });
    try {
      const response = await api.get<CheckInHistory[]>('/api/checkins/me', token);
      set({ history: response, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.body?.message || err.message });
    }
  },

  loadLeaderboard: async () => {
    set({ isLoading: true, error: null });
    try {
      // Leaderboard does not technically require auth on backend but good to pass token if we have it
      const response = await api.get<LeaderRank[]>('/api/leaderboard', get().token || undefined);
      set({ leaderboard: response, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.body?.message || err.message });
    }
  },

  loadBadges: async () => {
    const { token } = get();
    if (!token) return;

    set({ isLoading: true, error: null });
    try {
      const response = await api.get<BadgesSummary>('/api/badges/me', token);
      set({ badges: response, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.body?.message || err.message });
    }
  },

  updateSettings: async (dto) => {
    const { token } = get();
    if (!token) return;

    set({ isLoading: true, error: null });
    try {
      const response = await api.put<UserSettingsDto>('/api/settings/me', dto, token);
      
      // Store nickname in localStorage
      localStorage.setItem('nickname', response.nickname);
      if (response.avatarDataUrl) {
        localStorage.setItem('avatarUrl', response.avatarDataUrl);
      } else {
        localStorage.removeItem('avatarUrl');
      }
      
      // Update profile state shared across the application.
      set({ 
        nickname: response.nickname,
        avatarUrl: response.avatarDataUrl || null,
        onboardingCompleted: response.onboardingCompleted,
        isLoading: false 
      });
      
      // Reload summary in case cutoff is changed
      await get().loadSummary();
    } catch (err: any) {
      set({ isLoading: false, error: err.body?.message || err.message });
      throw err;
    }
  },

  loadSettings: async () => {
    const { token } = get();
    if (!token) return null;

    try {
      const response = await api.get<UserSettingsDto>('/api/settings/me', token);
      set({ onboardingCompleted: response.onboardingCompleted });
      return response;
    } catch (err: any) {
      set({ error: err.body?.message || err.message });
      return null;
    }
  }
}));
// Helper types
type int = number;
