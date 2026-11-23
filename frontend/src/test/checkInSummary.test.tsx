import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CheckInSummary } from '../components/CheckInSummary';
import { api } from '../services/api';
import { useStore } from '../stores/useStore';

beforeEach(() => useStore.setState({ token: 'test', history: [] }));
afterEach(() => { vi.restoreAllMocks(); useStore.setState({ token: null, history: [] }); });

it('applies the selected date range and displays the server counts', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({
    total: 10, onTime: 8, late: 2, onTimeRate: 80,
    weeks: [{ weekStart: '2026-10-05', from: '2026-10-05', to: '2026-10-11', total: 10, onTime: 8, late: 2 }],
  });
  render(<CheckInSummary />);
  expect(await screen.findByText('80.0%')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/checkins/me/summary?from=2026-10-01&to=2026-10-20', 'test'));
});

it('shows an undefined rate for empty data', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ total: 0, onTime: 0, late: 0, onTimeRate: null, weeks: [] });
  render(<CheckInSummary />);
  expect(await screen.findByText('No valid check-ins in this range.')).toBeInTheDocument();
  expect(screen.getByText('—')).toBeInTheDocument();
});

it('shows a retry after failure and recovers', async () => {
  vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ total: 0, onTime: 0, late: 0, onTimeRate: null, weeks: [] });
  render(<CheckInSummary />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('No valid check-ins in this range.')).toBeInTheDocument();
});

it('rejects a reversed range without sending another request', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ total: 0, onTime: 0, late: 0, onTimeRate: null, weeks: [] });
  render(<CheckInSummary />);
  await screen.findByText('No valid check-ins in this range.');
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-20' } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid range');
  expect(get).toHaveBeenCalledTimes(1);
});
