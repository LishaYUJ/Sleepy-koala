import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlassCard } from '../components/GlassCard';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { Auth } from '../pages/Auth';
import { History } from '../pages/History';
import { Landing } from '../pages/Landing';
import { api } from '../services/api';
import { useStore } from '../stores/useStore';

describe('Landing', () => {
  it('presents the bedtime habit and registration action', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /go to sleep on time/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /set my goal/i })).toHaveAttribute('href', '/login?mode=register');
    expect(screen.getByRole('region', { name: /how it works/i })).toBeInTheDocument();
  });
});

describe('MobileBottomNav', () => {
  it('renders every primary authenticated route', () => {
    render(
      <MemoryRouter initialEntries={['/history']}>
        <MobileBottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('History').closest('a')).toHaveClass('active');
    expect(screen.getByText('Leaderboard').closest('a')).toHaveAttribute('href', '/leaderboard');
    expect(screen.getByText('Badges').closest('a')).toHaveAttribute('href', '/badges');
    expect(screen.getByText('Settings').closest('a')).toHaveAttribute('href', '/settings');
  });
});

describe('History', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    useStore.setState({ token: null, history: [], isLoading: false, error: null });
  });

  it('shows check-ins and interspersed misses from the seven most recent sleep days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 10, 10, 0, 0));
    const checkedInAtUtc = '2026-10-09T12:20:00Z';
    const expectedTime = new Date(checkedInAtUtc).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const history = [
      {
        id: 'check-in-id',
        localCheckInDate: '2026-10-09',
        status: 'late',
        recorded: true,
        checkedInAtUtc,
      },
      {
        id: null,
        localCheckInDate: '2026-10-08',
        status: 'missing',
        recorded: false,
        checkedInAtUtc: null,
      },
    ];

    useStore.setState({ token: 'token', history, isLoading: false, error: null });
    vi.spyOn(api, 'get').mockResolvedValue(history);

    render(<History />);

    expect(screen.getByText(new RegExp(`Checked in at ${expectedTime.replace('.', '\\.')}\\.`))).toBeInTheDocument();
    expect(screen.getByText(/No bedtime check-in was recorded for this sleep day/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 7 consecutive days/i)).toBeInTheDocument();
  });

  it('collapses seven fully missed sleep days into one quiet recent-status message', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 10, 10, 0, 0));
    const history = Array.from({ length: 7 }, (_, index) => ({
      id: null,
      localCheckInDate: `2026-10-${String(9 - index).padStart(2, '0')}`,
      status: 'missing',
      recorded: false,
      checkedInAtUtc: null,
    }));

    useStore.setState({ token: 'token', history, isLoading: false, error: null });
    vi.spyOn(api, 'get').mockResolvedValue(history);

    render(<History />);

    expect(screen.getByText('No check-in lately')).toBeInTheDocument();
    expect(screen.queryByText(/No bedtime check-in was recorded for this sleep day/i)).not.toBeInTheDocument();
  });

  it('limits bedtime moments to the seven latest sleep dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 10, 10, 0, 0));
    const history = [
      {
        id: 'recent',
        localCheckInDate: '2026-10-09',
        status: 'onTime',
        recorded: true,
        checkedInAtUtc: '2026-10-09T10:00:00Z',
      },
      {
        id: 'older',
        localCheckInDate: '2026-10-02',
        status: 'onTime',
        recorded: true,
        checkedInAtUtc: '2026-10-02T10:00:00Z',
      },
    ];

    useStore.setState({ token: 'token', history, isLoading: false, error: null });
    vi.spyOn(api, 'get').mockResolvedValue(history);

    render(<History />);

    expect(screen.getByText(/Friday, October 9/)).toBeInTheDocument();
    expect(screen.queryByText(/Friday, October 2/)).not.toBeInTheDocument();
  });
});

describe('GlassCard', () => {
  it('forwards semantic attributes and interactive styling', () => {
    render(
      <GlassCard interactive aria-label="Sleep summary">
        Tonight's progress
      </GlassCard>,
    );

    const card = screen.getByLabelText('Sleep summary');
    expect(card).toHaveClass('glass-card', 'interactive');
    expect(card).toHaveTextContent("Tonight's progress");
  });
});

describe('Auth connection states', () => {
  beforeEach(() => {
    useStore.setState({
      token: null,
      isLoading: false,
      isWakingServer: false,
      authPhase: 'idle',
      authErrorKind: null,
      error: null,
    });
  });

  afterEach(() => {
    useStore.setState({ authPhase: 'idle', authErrorKind: null, error: null });
  });

  it('uses koala-focused loading copy while signing in', () => {
    useStore.setState({
      isLoading: true,
      isWakingServer: true,
      authPhase: 'waking',
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Auth />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Finding your koala');
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Finding your koala. Please wait.',
    );
    expect(screen.getByRole('button', { name: /please wait/i })).toBeDisabled();
  });

  it('keeps registration recovery details simple for the user', () => {
    useStore.setState({
      isLoading: true,
      isWakingServer: true,
      authPhase: 'recovering',
    });

    render(
      <MemoryRouter initialEntries={['/login?mode=register']}>
        <Auth />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Preparing for your koala’s arrival');
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Preparing for your koala’s arrival. Please wait.',
    );
    expect(screen.getByRole('button', { name: /please wait/i })).toBeDisabled();
  });

  it('offers a safe retry when the registration result cannot be confirmed', () => {
    useStore.setState({
      authErrorKind: 'registration-unconfirmed',
      error: 'We could not confirm your registration result. You can safely try again.',
    });

    render(
      <MemoryRouter initialEntries={['/login?mode=register']}>
        <Auth />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/could not confirm/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });
});
