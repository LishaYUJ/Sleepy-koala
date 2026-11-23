import { api } from './api';

export interface PushConfig { enabled: boolean; publicKey: string | null }
export interface PushDevice { id: string; openingReminder: boolean; windDownReminder: boolean; timeZoneId: string }

export function pushSupport(): 'supported' | 'install' | 'unsupported' {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !standalone) return 'install';
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    ? 'supported' : 'unsupported';
}

export const reminderTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export async function existingSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration?.pushManager ? registration.pushManager.getSubscription() : null;
}

export async function loadPushDevice(token: string): Promise<PushDevice | null> {
  const subscription = await existingSubscription();
  if (!subscription) return null;
  const response = await api.post<{ device: PushDevice | null }>('/api/push/device', { endpoint: subscription.endpoint }, token);
  return response.device;
}

function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, c => c.charCodeAt(0));
}

async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Notifications could not start. Reload the page and try again.')), 15_000);
      }),
    ]);
  } finally { clearTimeout(timeout); }
}

// Called directly by a user click; do not put a network request before the permission prompt.
export async function enablePush(token: string, publicKey: string): Promise<PushDevice> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied'
    ? 'Notifications are blocked. Allow them in your browser or device settings, then try again.'
    : 'Notifications were not enabled. You can try again whenever you’re ready.');
  const registration = await activeRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const { device: owned } = await api.post<{ device: PushDevice | null }>('/api/push/device', { endpoint: subscription.endpoint }, token);
    const key = subscription.options.applicationServerKey;
    const desired = applicationKey(publicKey);
    const keyMatches = key && new Uint8Array(key).length === desired.length &&
      new Uint8Array(key).every((byte, i) => byte === desired[i]);
    if (!owned || !keyMatches) {
      if (owned) await api.post('/api/push/unsubscribe', { endpoint: subscription.endpoint }, token);
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(publicKey) });
  return savePushSubscription(token, subscription);
}

async function savePushSubscription(token: string, subscription: PushSubscription): Promise<PushDevice> {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) throw new Error('This browser could not create a notification subscription.');
  return api.put('/api/push/device', { endpoint: subscription.endpoint, p256dh: keys.p256dh,
    auth: keys.auth, timeZoneId: reminderTimeZone() }, token);
}

export async function disablePush(token: string): Promise<void> {
  const subscription = await existingSubscription();
  if (!subscription) return;
  await api.post('/api/push/unsubscribe', { endpoint: subscription.endpoint }, token);
  await subscription.unsubscribe();
}

// Unsubscribe at the browser even if an expired session prevents server cleanup.
export async function stopPushOnLogout(token: string): Promise<void> {
  const subscription = await existingSubscription();
  if (!subscription) return;
  await Promise.allSettled([
    api.post('/api/push/unsubscribe', { endpoint: subscription.endpoint }, token),
    subscription.unsubscribe(),
  ]);
}

export async function syncReminderTimeZone(token: string): Promise<void> {
  const device = await loadPushDevice(token);
  if (device && device.timeZoneId !== reminderTimeZone())
    await api.put(`/api/push/devices/${device.id}/timezone`, { timeZoneId: reminderTimeZone() }, token);
}
