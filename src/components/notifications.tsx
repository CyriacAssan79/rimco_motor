'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  browserNotificationsToShow, createNotificationCenter, documentTitle, notificationHref, unreadActions,
  type AppNotification, type CenterSnapshot,
} from '@/core/notifications/center';
import { useGenerationTracker } from './generation-tracker';

const EMPTY: CenterSnapshot = { notifications: [], pendingReviewCount: 0, loaded: false };
const BROWSER_PREF_KEY = 'rimco:browser-notifications';
type CenterApi = { snapshot: CenterSnapshot; markRead(ids?: string[]): Promise<void> };
const Context = createContext<CenterApi>({ snapshot: EMPTY, markRead: async () => undefined });
export const useNotifications = () => useContext(Context);

/**
 * Bell, badges, banner and tab title stay up to date without changing page: reload every 60 s while the tab is
 * visible, and at once when the video follow-up sees a version finish or wait for a decision.
 */
export function NotificationsProvider({ enabled, countReviews, children }: { enabled: boolean; countReviews: boolean; children: React.ReactNode }) {
  const [center, setCenter] = useState<ReturnType<typeof createNotificationCenter> | null>(null);
  const tracker = useGenerationTracker();
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled) return;
    const instance = createNotificationCenter({
      async fetchJson(url) {
        const response = await fetch(url, { cache: 'no-store' });
        return { ok: response.ok, data: await response.json().catch(() => ({})) as Record<string, unknown> };
      },
      setInterval: (run, ms) => window.setInterval(run, ms),
      clearInterval: (handle) => window.clearInterval(handle as number),
      isVisible: () => document.visibilityState === 'visible',
      countReviews,
    });
    setCenter(instance);
    instance.start();
    const onVisibility = () => { if (document.visibilityState === 'visible') void instance.refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      instance.stop();
      document.removeEventListener('visibilitychange', onVisibility);
      setCenter(null);
    };
  }, [enabled, countReviews]);

  // A followed video changed state (ready, failed, waiting for a decision): its notification is already written.
  const trackerSignature = tracker.snapshot.versions.map((version) => `${version.id}:${version.versionStatus ?? version.status}:${version.reviewRequired?.length ?? 0}:${(version.keyframeApproval as { requestedAt?: string; remindedAt?: string } | undefined)?.requestedAt ?? ''}:${(version.keyframeApproval as { remindedAt?: string } | undefined)?.remindedAt ?? ''}`).join('|');
  const lastSignature = useRef('');
  useEffect(() => {
    if (!center || trackerSignature === lastSignature.current) return;
    const first = lastSignature.current === '';
    lastSignature.current = trackerSignature;
    if (!first) void center.refresh();
  }, [center, trackerSignature]);

  const subscribe = useMemo(() => center ? center.subscribe : () => () => undefined, [center]);
  const getSnapshot = useMemo(() => center ? center.getSnapshot : () => EMPTY, [center]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  // Tab title: « (1) Action requise · RIMCO Studio », « Vidéo prête · RIMCO Studio ». Set again after each page change.
  useEffect(() => {
    if (enabled) document.title = documentTitle(snapshot.notifications);
  }, [enabled, snapshot.notifications, pathname]);

  // Browser notifications, only if the user turned them on from the bell; never for what was there at load.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!snapshot.loaded) return;
    if (known.current === null) {
      known.current = new Set(snapshot.notifications.map((item) => item.id));
      return;
    }
    const fresh = browserNotificationsToShow(known.current, snapshot.notifications);
    snapshot.notifications.forEach((item) => known.current!.add(item.id));
    if (!fresh.length || readBrowserPreference() !== 'on' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    for (const item of fresh) {
      // The tag is the notification id: several open tabs show it only once.
      const shown = new Notification(item.type === 'action_required' ? 'Action requise · RIMCO Studio' : 'Vidéo prête · RIMCO Studio', { body: item.message, tag: item.id });
      const href = notificationHref(item);
      shown.onclick = () => { window.focus(); if (href) window.location.assign(href); };
    }
  }, [snapshot]);

  const markRead = useCallback(async (ids?: string[]) => {
    center?.markRead(ids);
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ids ? { ids } : {}) }).catch(() => undefined);
  }, [center]);
  const value = useMemo(() => ({ snapshot, markRead }), [snapshot, markRead]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function readBrowserPreference() {
  try { return window.localStorage.getItem(BROWSER_PREF_KEY); } catch { return null; }
}

/** Opt-in from the bell only: the permission is never requested automatically. */
function BrowserNotificationToggle() {
  const [state, setState] = useState<'unsupported' | 'denied' | 'on' | 'off'>('unsupported');
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    setState(Notification.permission === 'denied' ? 'denied' : Notification.permission === 'granted' && readBrowserPreference() === 'on' ? 'on' : 'off');
  }, []);
  if (state === 'unsupported') return null;
  if (state === 'denied') return <p className="border-t border-[var(--border)] px-2 pt-2 text-xs text-[#6b6760]">Les notifications du navigateur sont bloquées dans les réglages du navigateur.</p>;
  async function toggle() {
    if (state === 'on') {
      try { window.localStorage.setItem(BROWSER_PREF_KEY, 'off'); } catch { /* ignored */ }
      setState('off');
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') { setState(permission === 'denied' ? 'denied' : 'off'); return; }
    try { window.localStorage.setItem(BROWSER_PREF_KEY, 'on'); } catch { /* ignored */ }
    setState('on');
  }
  return <div className="border-t border-[var(--border)] px-2 pt-2">
    <button type="button" onClick={() => void toggle()} className="min-h-10 text-left text-xs font-semibold text-[#c51e1c] underline underline-offset-2">
      {state === 'on' ? 'Désactiver les notifications du navigateur' : 'Activer les notifications du navigateur'}
    </button>
    <p className="text-xs text-[#6b6760]">Pour les décisions à prendre et les vidéos prêtes, même quand l’onglet est en arrière-plan.</p>
  </div>;
}

export function NotificationBell() {
  const { snapshot, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const unread = snapshot.notifications.filter((item) => !item.read_at).length;
  // Opening the bell reads the information; an « action requise » stays until the decision is taken.
  function openBell() {
    setOpen((value) => !value);
    const ids = snapshot.notifications.filter((item) => !item.read_at && item.type !== 'action_required').map((item) => item.id).slice(0, 50);
    if (ids.length) void markRead(ids);
  }
  return <div className="relative shrink-0">
    <button type="button" aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'} aria-expanded={open} onClick={openBell} className="relative grid size-11 place-items-center rounded-full border border-[var(--border)] text-[#55545a] hover:bg-[#f5f5f3]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px] fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      {unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[var(--brand-red)] px-1 text-[11px] font-bold text-white">{unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-12 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border)] bg-white p-3 shadow-xl">
      <p className="px-2 pb-2 text-xs font-semibold">Notifications</p>
      {snapshot.setupNotice && <p role="status" className="mb-2 rounded bg-[#fbf6ed] p-2 text-xs text-[#765d39]">{snapshot.setupNotice}</p>}
      {snapshot.notifications.length === 0 ? <p className="px-2 py-4 text-xs text-[#6b6760]">Aucune notification.</p> : <ul className="max-h-72 space-y-1 overflow-auto">{snapshot.notifications.map((item) => {
        const href = notificationHref(item);
        const body = <>{item.message}<span className="mt-1 block text-xs text-[#6b6760]">{new Date(item.created_at).toLocaleString('fr-FR')}</span></>;
        return <li key={item.id} className={`rounded-lg px-3 py-2 text-xs ${item.type === 'action_required' && !item.read_at ? 'bg-[#fdf4f3] text-[#831810]' : 'bg-[#f8f7f4] text-[#55545a]'}`}>{href ? <Link href={href} onClick={() => { setOpen(false); void markRead([item.id]); }} className="block">{body}</Link> : body}</li>;
      })}</ul>}
      <BrowserNotificationToggle />
    </div>}
  </div>;
}

/** An unread « action requise » is shown on every page, with a direct link to the decision panel. */
export function ActionRequiredBanner() {
  const { snapshot, markRead } = useNotifications();
  const actions = unreadActions(snapshot.notifications);
  if (!actions.length) return null;
  const first: AppNotification = actions[0];
  const href = notificationHref(first) ?? '/file-generation';
  return <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-[#e7c9c6] bg-[#fdf4f3] p-4 text-sm text-[#831810]">
    <p className="min-w-0 flex-1"><strong>{first.type === 'expired' ? 'Vidéo expirée · ' : 'Action requise · '}</strong>{first.message}{actions.length > 1 ? ` (+${actions.length - 1} autre${actions.length > 2 ? 's' : ''})` : ''}</p>
    <Link href={href} onClick={() => void markRead([first.id])} className="inline-flex min-h-11 items-center rounded-md bg-[#c51e1c] px-4 text-xs font-semibold text-white hover:bg-[#a71715]">{first.type === 'expired' ? 'Voir la vidéo' : first.dedupe_key?.startsWith('keyframe_approval') ? 'Voir les images clés' : 'Voir le plan'}</Link>
  </div>;
}
