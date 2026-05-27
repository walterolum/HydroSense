import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribePush, unsubscribePush, getPushSubscriptions } from '../api/client';

export function usePushNotifications() {
  const { user } = useAuth();
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!user) { setSubscribed(false); setSubscription(null); return; }

    const check = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setSupported(false);
        return;
      }
      setSupported(true);

      try {
        const reg = await navigator.serviceWorker.ready;
        swRef.current = reg;
        const sub = await reg.pushManager.getSubscription();
        setSubscription(sub);
        setSubscribed(!!sub);
      } catch {}
    };

    check();
  }, [user]);

  const subscribe = async () => {
    if (!swRef.current || !supported) return;

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;

      // Generate VAPID keys — server will provide these
      const sub = await swRef.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          'BBQ8KxjC-xAZhBmPb5BqYfJXeO3bBZKPyzqKn5s5YyhCGJThmYQAVHFnXmNh6D7JqKZ3q5VvGXZpVKkQNcGYPmM'
        ) as unknown as BufferSource,
      });

      // Send to server
      await subscribePush({
        subscription: sub.toJSON(),
        platform: /android|iphone|ipad|ipod/i.test(navigator.userAgent) ? 'mobile' : 'web',
        device_name: navigator.userAgent.slice(0, 100),
      });

      setSubscription(sub);
      setSubscribed(true);
      return sub;
    } catch {}
    return null;
  };

  const unsubscribe = async () => {
    if (!subscription) return;

    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await unsubscribePush(endpoint);

      setSubscription(null);
      setSubscribed(false);
    } catch {}
  };

  return { supported, subscribed, subscription, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
