import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Onboarding } from '../pages/Onboarding';
import { SleepReminders } from '../components/SleepReminders';
import { api } from '../services/api';
import * as push from '../services/push';

const onboarding = vi.hoisted(() => ({ loadSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('../stores/useStore', () => ({ useStore: () => ({ ...onboarding, token: 'session', isLoading: false }) }));

vi.mock('../services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../services/push', () => ({ pushSupport: vi.fn(), loadPushDevice: vi.fn(), reminderTimeZone: () => 'Pacific/Auckland',
  enablePush: vi.fn(), disablePush: vi.fn() }));

describe('Sleep reminders settings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('Notification', { permission: 'granted' });
    onboarding.loadSettings.mockResolvedValue({ nickname: 'Koala', cutoffTime: '22:00', onboardingCompleted: false });
    onboarding.updateSettings.mockResolvedValue({});
    vi.mocked(api.get).mockResolvedValue({ enabled: true, publicKey: 'public-key' });
    vi.mocked(push.pushSupport).mockReturnValue('supported');
    vi.mocked(push.loadPushDevice).mockResolvedValue(null);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('explains iPhone installation instead of offering a non-working permission button', async () => {
    vi.mocked(push.pushSupport).mockReturnValue('install');
    render(<SleepReminders token="session" />);
    expect(await screen.findByText('Add Koala to your Home Screen')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Sleep reminders on this device' })).toBeDisabled();
    expect(push.enablePush).not.toHaveBeenCalled();
  });

  it('uses a single opt-in for both reminders and exposes a test notification', async () => {
    vi.mocked(push.enablePush).mockResolvedValue({ id: 'device', openingReminder: true, windDownReminder: true, timeZoneId: 'Pacific/Auckland' });
    vi.mocked(api.post).mockResolvedValue({ message: 'Test sent.' });
    render(<SleepReminders token="session" />);
    const enable = await screen.findByRole('switch', { name: 'Sleep reminders on this device' });
    expect(push.enablePush).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('9:00 PM')).toBeInTheDocument();
    expect(screen.getByText('Wind-down reminder')).toBeInTheDocument();
    fireEvent.click(enable);
    await waitFor(() => expect(push.enablePush).toHaveBeenCalledWith('session', 'public-key'));
    fireEvent.click(await screen.findByRole('button', { name: 'Send test notification' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/push/devices/device/test', {}, 'session'));
    fireEvent.click(screen.getByRole('switch', { name: 'Sleep reminders on this device' }));
    await waitFor(() => expect(push.disablePush).toHaveBeenCalledWith('session'));
  });

  it('shows permission errors without falsely claiming reminders are enabled', async () => {
    vi.mocked(push.enablePush).mockRejectedValue(new Error('Notifications are blocked.'));
    render(<SleepReminders token="session" />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Sleep reminders on this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications are blocked.');
    expect(screen.queryByRole('button', { name: 'Send test notification' })).not.toBeInTheDocument();
  });

  it.each(['success', 'failure'])('shows sending feedback until the test request settles with %s', async (outcome) => {
    vi.mocked(push.loadPushDevice).mockResolvedValue({ id: 'device', openingReminder: true, windDownReminder: true, timeZoneId: 'Pacific/Auckland' });
    let resolve!: (value: { message: string }) => void;
    let reject!: (reason: Error) => void;
    vi.mocked(api.post).mockReturnValue(new Promise((res, rej) => { resolve = res; reject = rej; }));
    render(<SleepReminders token="session" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send test notification' }));
    const sending = screen.getByRole('button', { name: 'Sending…' });
    expect(sending).toBeDisabled();
    expect(sending).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Sending your test notification');
    expect(screen.getByRole('switch', { name: 'Sleep reminders on this device' })).toBeDisabled();
    expect(screen.queryByText(/Test sent/)).not.toBeInTheDocument();
    fireEvent.click(sending);
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (outcome === 'success') resolve({ message: 'Test sent.' });
      else reject(new Error('Could not send the test. Please try again.'));
    });
    expect(screen.getByRole('button', { name: 'Send test notification' })).toBeEnabled();
    expect(screen.queryByText(/Sending your test notification/)).not.toBeInTheDocument();
    if (outcome === 'success') expect(screen.getByRole('status')).toHaveTextContent('Test sent.');
    else expect(screen.getByRole('alert')).toHaveTextContent('Could not send the test. Please try again.');
  });

  it('does not request notification permission while the server is unconfigured', async () => {
    vi.mocked(api.get).mockResolvedValue({ enabled: false, publicKey: null });
    render(<SleepReminders token="session" />);
    expect(await screen.findByText(/Reminders aren’t available yet/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Sleep reminders on this device' })).toBeDisabled();
  });
  it('offers reminders during registration setup without requiring them to continue', async () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Enable reminders' })).toBeInTheDocument();
    expect(screen.queryByText('How reminders work')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(onboarding.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ onboardingCompleted: true })));
    expect(push.enablePush).not.toHaveBeenCalled();
  });

  it('detects blocked permission and rechecks after the user changes it', async () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    render(<SleepReminders token="session" />);
    expect(await screen.findByText('Allow notifications to get started')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Sleep reminders on this device' })).toBeDisabled();
    vi.stubGlobal('Notification', { permission: 'granted' });
    fireEvent.click(screen.getByRole('button', { name: 'Check permission again' }));
    expect(screen.getByRole('switch', { name: 'Sleep reminders on this device' })).toBeEnabled();
    expect(push.enablePush).not.toHaveBeenCalled();
  });

  it.each([['23:15', '10:45 PM'], ['00:00', '11:30 PM'], ['21:00', '8:30 PM']])('shows actual wind-down time for %s', async (cutoffTime, expected) => {
    render(<SleepReminders token="session" cutoffTime={cutoffTime} />);
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.getByText('Local time · Auckland')).toBeInTheDocument();
    expect(screen.getByText('How reminders work').closest('details')).not.toHaveAttribute('open');
  });

  it('shows one combined reminder when times overlap', async () => {
    render(<SleepReminders token="session" cutoffTime="21:30" />);
    expect(await screen.findByText('Check-in & wind-down reminder')).toBeInTheDocument();
    expect(screen.getAllByText('9:00 PM')).toHaveLength(1);
  });

});
