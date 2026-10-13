'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Role = 'collaborateur' | 'valideur' | 'admin';
type NavItem = { label: string; href: string; icon: string; roles?: Role[]; badge?: boolean };
const nav: NavItem[] = [
  { label: 'Accueil', href: '/', icon: 'home' },
  { label: 'Studio de création', href: '/studio', icon: 'spark', roles: ['collaborateur', 'admin'] },
  { label: 'File de génération', href: '/file-generation', icon: 'queue', roles: ['collaborateur', 'admin'] },
  { label: 'À valider', href: '/a-valider', icon: 'check', roles: ['valideur', 'admin'], badge: true },
  { label: 'Bibliothèque', href: '/bibliotheque', icon: 'film' },
  { label: 'Médiathèque assets', href: '/mediatheque', icon: 'image', roles: ['collaborateur', 'admin'] },
  { label: 'Suivi de consommation', href: '/couts', icon: 'chart', roles: ['admin'] },
  { label: 'Équipe', href: '/equipe', icon: 'users', roles: ['admin'] },
  { label: 'Admin', href: '/admin', icon: 'settings', roles: ['admin'] },
];

const iconPaths: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
  film: 'M4 4h16v16H4zM4 9h16M4 15h16M9 4v5M15 4v5M9 15v5M15 15v5',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01',
  chart: 'M4 19V5M4 19h16M8 15l3-4 3 2 5-7',
  compare: 'M7 7h13M7 7l4-4M7 7l4 4M17 17H4m13 0-4-4m4 4-4 4',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.6 2.8-.2-.1a1.7 1.7 0 0 0-1.9.3l-.1.1h-3.2l-.1-.2a1.7 1.7 0 0 0-1.6-1 1.7 1.7 0 0 0-1.6 1l-.1.2H6.2l-.1-.1a1.7 1.7 0 0 0-1.9-.3l-.2.1-1.6-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9l-.1-.2v-3.2l.2-.1a1.7 1.7 0 0 0 1-1.6 1.7 1.7 0 0 0-1-1.6l-.2-.1 1.6-2.8.2.1 1.9-.3.1-.1h3.2l.1.2a1.7 1.7 0 0 0 1.6 1 1.7 1.7 0 0 0 1.6-1l.1-.2h3.2l.1.1a1.7 1.7 0 0 0 1.9.3l.2-.1 1.6 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9l.1.2v3.2l-.2.1a1.7 1.7 0 0 0-1 1.6',
  queue: 'M4 6h16M4 12h16M4 18h16M7 6h.01M7 12h.01M7 18h.01',
  check: 'M5 12l4 4L19 6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
};

function NavLink({ item, pathname, mobile = false, badge }: { item: NavItem; pathname: string; mobile?: boolean; badge?: number }) {
  const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
  return <Link aria-current={active ? 'page' : undefined} href={item.href} className={`${mobile ? 'min-h-11 shrink-0' : 'min-h-11 w-full'} flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c] ${active ? 'bg-[#fae9e8] text-[#b51d19]' : 'text-[#55545a] hover:bg-[#f2f2f3] hover:text-[#17171a]'}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[17px] shrink-0 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[item.icon]} /></svg><span className="truncate">{item.label}</span>{badge ? <span className="ml-auto rounded-full bg-[#c51e1c] px-1.5 py-0.5 text-[9px] font-bold text-white">{badge}</span> : null}
  </Link>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [actor, setActor] = useState<{ role: Role; name?: string; department?: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; read_at?: string | null; created_at: string }>>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/me').then(async (response) => response.ok ? response.json() : null).then((data) => {
      if (active && data?.actor) setActor(data.actor);
    }).catch(() => undefined);
    fetch('/api/versions?status=review').then(async (response) => response.ok ? response.json() : null).then((data) => {
      if (active && data) setPendingCount(Array.isArray(data.versions) ? data.versions.length : 0);
    }).catch(() => undefined);
    fetch('/api/notifications').then(async (response) => response.ok ? response.json() : null).then((data) => {
      if (active && data) setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [pathname]);
  if (pathname === '/connexion') return <>{children}</>;
  const role = actor?.role ?? 'collaborateur';
  const visibleNav = nav.filter((item) => !item.roles || item.roles.includes(role));
  const page = visibleNav.find((item) => item.href === pathname)?.label ?? 'Studio de création';
  const roleLabel = role === 'admin' ? 'Administrateur' : role === 'valideur' ? 'Valideur' : 'Collaborateur';
  return <div className="min-h-screen bg-[var(--background)] text-[var(--ink)]">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[232px] flex-col border-r border-[var(--border)] bg-white px-3 py-5 text-[#17171a] lg:flex">
      <Link href="/" aria-label="RIMCO Motors, accueil" className="mb-10 flex min-h-10 items-center px-2"><Image src="/brand/logo-rimco.png" alt="RIMCO Motors" width={204} height={60} priority className="h-auto w-[176px] object-contain object-left" /></Link>
      <p className="mb-3 px-3 text-[9px] font-bold uppercase tracking-[.2em] text-[#8a8990]">Production</p>
      <nav className="space-y-1">{visibleNav.filter((item) => !['/couts','/equipe','/admin'].includes(item.href)).map((item) => <NavLink key={item.href} item={item} pathname={pathname} badge={item.badge ? pendingCount : undefined} />)}</nav>
      {role === 'admin' && <><p className="mb-3 mt-8 px-3 text-[9px] font-bold uppercase tracking-[.2em] text-[#8a8990]">Pilotage</p><nav className="space-y-1">{visibleNav.filter((item) => ['/couts','/equipe','/admin'].includes(item.href)).map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}</nav></>}
      <div className="mt-auto border-t border-[var(--border)] pt-4"><p className="text-sm font-semibold">{actor?.name ?? 'Votre espace'}</p><p className="mt-1 text-xs text-[#77777d]">{roleLabel}{actor?.department ? ` · ${actor.department}` : ''}</p><button type="button" className="mt-3 text-xs text-[#77777d] underline underline-offset-4">Quitter</button></div>
    </aside>
    <div className="lg:pl-[232px]">
      <header className="sticky top-0 z-10 flex h-[62px] items-center justify-between border-b border-[var(--border)] bg-white px-5 md:px-8"><div className="text-xs text-[#77777d]">RIMCO Motors <span className="px-2 text-[#c5c5ca]">/</span><span className="font-semibold text-[#242428]">{page}</span></div><div className="relative"><button type="button" aria-label="Notifications" aria-expanded={showNotifications} onClick={async () => { setShowNotifications((value) => !value); if (notifications.some((item) => !item.read_at)) { await fetch('/api/notifications', { method: 'PATCH' }).catch(() => undefined); setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() }))); } }} className="relative grid size-9 place-items-center rounded-full border border-[var(--border)] text-[#55545a] hover:bg-[#f5f5f3]"><span aria-hidden="true">♢</span>{notifications.some((item) => !item.read_at) && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--brand-red)]" />}</button>{showNotifications && <div className="absolute right-0 top-11 z-30 w-80 rounded-xl border border-[var(--border)] bg-white p-3 shadow-xl"><p className="px-2 pb-2 text-xs font-semibold">Notifications</p>{notifications.length === 0 ? <p className="px-2 py-4 text-xs text-[#77777d]">Aucune notification.</p> : <ul className="max-h-72 space-y-1 overflow-auto">{notifications.map((item) => <li key={item.id} className="rounded-lg bg-[#f8f7f4] px-3 py-2 text-xs text-[#55545a]">{item.message}<span className="mt-1 block text-[10px] text-[#96928c]">{new Date(item.created_at).toLocaleString('fr-FR')}</span></li>)}</ul>}</div>}</div></header>
      <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-white px-3 py-2 lg:hidden">{visibleNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} mobile badge={item.badge ? pendingCount : undefined} />)}</nav>
      <main id="main" className="mx-auto max-w-[1440px] p-5 md:px-8 md:py-8">{children}</main>
    </div>
  </div>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.16em] text-[var(--brand-red)]">{eyebrow}</p><h1 className="text-[34px] leading-tight tracking-[-.02em] md:text-[42px]">{title}</h1><p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{description}</p></div>{action}</div>;
}

export function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return <div className="border border-[var(--border)] bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">{label}</p><div className="mt-4 flex items-end justify-between"><strong className="text-[27px] font-semibold tracking-[-.04em]">{value}</strong>{accent && <span className="bg-[#fae9e8] px-2.5 py-1 text-[10px] font-semibold text-[#9c2822]">{accent}</span>}</div><p className="mt-1.5 text-xs text-[var(--muted)]">{sub}</p></div>;
}

export function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = { Prête: 'bg-[#e9f2eb] text-[#42694a]', Génération: 'bg-[#fae9e8] text-[#9c2822]', Validation: 'bg-[#efeff1] text-[#55555d]', Brouillon: 'bg-[#efeff1] text-[#55555d]', Échec: 'bg-[#fae9e7] text-[#9d352e]' };
  return <span className={`inline-flex rounded-sm px-2.5 py-1 text-[10px] font-semibold ${colors[status] ?? 'bg-[#efeff1] text-[#55555d]'}`}>{status}</span>;
}
