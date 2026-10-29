"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  GenerationIndicator,
  GenerationTrackerProvider,
} from "./generation-tracker";
import { canValidate, hasAdminRights, isOperator, roleLabel } from "@/core/auth/roles";
import {
  ActionRequiredBanner,
  NotificationBell,
  NotificationsProvider,
  useNotifications,
} from "./notifications";

type Section = "production" | "administration" | "komian";
type NavItem = {
  label: string;
  href: string;
  icon: string;
  section: Section;
  /** Shown only when the actor has the right (27/10: navigation built from rights, nothing greyed out). */
  visible?: (actor: Actor) => boolean;
  badge?: boolean;
};
const nav: NavItem[] = [
  { label: "Accueil", href: "/", icon: "home", section: "production" },
  { label: "File de génération", href: "/file-generation", icon: "queue", section: "production" },
  // 29/10 · O03 : « À valider » seulement si le client a activé la validation des vidéos (désactivée par défaut).
  { label: "À valider", href: "/a-valider", icon: "check", section: "production", visible: (actor) => canValidate(actor) && actor.videoValidation === true, badge: true },
  { label: "Bibliothèque", href: "/bibliotheque", icon: "film", section: "production" },
  { label: "Médiathèque", href: "/mediatheque", icon: "image", section: "production" },
  { label: "Crédits", href: "/credits", icon: "wallet", section: "production" },
  { label: "Équipe", href: "/equipe", icon: "users", section: "administration", visible: hasAdminRights },
  { label: "Clients et crédits", href: "/operateur/clients", icon: "wallet", section: "komian", visible: isOperator },
  { label: "Coûts de production", href: "/couts", icon: "chart", section: "komian", visible: isOperator },
  { label: "Paramètres", href: "/admin", icon: "settings", section: "komian", visible: isOperator },
];
const SECTION_TITLES: Record<Section, string> = { production: "Production", administration: "Administration", komian: "Espace KÔMIAN" };

const iconPaths: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6",
  spark:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z",
  film: "M4 4h16v16H4zM4 9h16M4 15h16M9 4v5M15 4v5M9 15v5M15 15v5",
  image: "M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01",
  chart: "M4 19V5M4 19h16M8 15l3-4 3 2 5-7",
  compare: "M7 7h13M7 7l4-4M7 7l4 4M17 17H4m13 0-4-4m4 4-4 4",
  settings:
    "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.6 2.8-.2-.1a1.7 1.7 0 0 0-1.9.3l-.1.1h-3.2l-.1-.2a1.7 1.7 0 0 0-1.6-1 1.7 1.7 0 0 0-1.6 1l-.1.2H6.2l-.1-.1a1.7 1.7 0 0 0-1.9-.3l-.2.1-1.6-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9l-.1-.2v-3.2l.2-.1a1.7 1.7 0 0 0 1-1.6 1.7 1.7 0 0 0-1-1.6l-.2-.1 1.6-2.8.2.1 1.9-.3.1-.1h3.2l.1.2a1.7 1.7 0 0 0 1.6 1 1.7 1.7 0 0 0 1.6-1l.1-.2h3.2l.1.1a1.7 1.7 0 0 0 1.9.3l.2-.1 1.6 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9l.1.2v3.2l-.2.1a1.7 1.7 0 0 0-1 1.6",
  queue: "M4 6h16M4 12h16M4 18h16M7 6h.01M7 12h.01M7 18h.01",
  check: "M5 12l4 4L19 6",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  wallet: "M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H3V7Zm0 0V5.5A1.5 1.5 0 0 1 4.5 4H16M16 13.5h.01",
};

function NavLink({
  item,
  pathname,
  mobile = false,
  badge,
}: {
  item: NavItem;
  pathname: string;
  mobile?: boolean;
  badge?: number;
}) {
  const active =
    pathname === item.href ||
    (item.href !== "/" && pathname.startsWith(item.href));
  return (
    <Link
      aria-current={active ? "page" : undefined}
      href={item.href}
      className={`${mobile ? "min-h-11 shrink-0" : "min-h-11 w-full"} flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c51e1c] ${active ? "bg-[#fae9e8] text-[#b51d19]" : "text-[#55545a] hover:bg-[#f2f2f3] hover:text-[#17171a]"}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-[17px] shrink-0 fill-none stroke-current"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={iconPaths[item.icon]} />
      </svg>
      <span className="truncate">{item.label}</span>
      {badge ? (
        <span className="ml-auto rounded-full bg-[#c51e1c] px-1.5 py-0.5 text-xs font-bold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

type Actor = { id?: string; role: string; canValidate?: boolean; name?: string; videoValidation?: boolean };

/** 29/10 · O03 : réglage « validation des vidéos » du client, lu par le Studio (désactivé tant que /api/me n'a pas répondu). */
const VideoValidationContext = createContext(false);
export function useVideoValidation(): boolean {
  return useContext(VideoValidationContext);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [actor, setActor] = useState<Actor | null>(null);
  useEffect(() => {
    if (actor || pathname === "/connexion") return;
    let active = true;
    fetch("/api/me")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.actor) setActor({ ...data.actor, videoValidation: data.videoValidation === true });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname, actor]);
  if (pathname === "/connexion") return <>{children}</>;
  return (
    <GenerationTrackerProvider
      enabled={Boolean(actor)}
      userId={actor?.id}
    >
      <NotificationsProvider
        enabled={Boolean(actor)}
        countReviews={canValidate(actor) && actor?.videoValidation === true}
      >
        <VideoValidationContext.Provider value={actor?.videoValidation === true}>
          <ShellFrame actor={actor} pathname={pathname}>
            {children}
          </ShellFrame>
        </VideoValidationContext.Provider>
      </NotificationsProvider>
    </GenerationTrackerProvider>
  );
}

/** Layout of the signed-in pages, under the providers: badges, bell and banner follow without page change. */
function ShellFrame({
  actor,
  pathname,
  children,
}: {
  actor: Actor | null;
  pathname: string;
  children: React.ReactNode;
}) {
  const { snapshot } = useNotifications();
  const pendingCount = snapshot.pendingReviewCount;
  const current: Actor = actor ?? { role: "collaborateur" };
  const visibleNav = nav.filter((item) => !item.visible || item.visible(current));
  const page =
    visibleNav.find((item) => item.href === pathname)?.label ?? "Accueil";
  const sections = (Object.keys(SECTION_TITLES) as Section[])
    .map((section) => ({ section, items: visibleNav.filter((item) => item.section === section) }))
    .filter((group) => group.items.length > 0);
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--ink)]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[232px] flex-col overflow-y-auto border-r border-[var(--border)] bg-white px-3 py-5 text-[#17171a] lg:flex">
        <Link
          href="/"
          aria-label="RIMCO Motors, accueil"
          className="mb-10 flex min-h-10 items-center px-2"
        >
          <Image
            src="/brand/logo-rimco.png"
            alt="RIMCO Motors"
            width={204}
            height={60}
            priority
            className="h-auto w-[176px] object-contain object-left"
          />
        </Link>
        {sections.map(({ section, items }, index) => (
          <div key={section} className={index > 0 ? "mt-8" : undefined}>
            <p className={`mb-3 px-3 text-xs font-bold uppercase tracking-[.2em] ${section === "komian" ? "text-[#831810]" : "text-[#626269]"}`}>
              {SECTION_TITLES[section]}
            </p>
            <nav aria-label={SECTION_TITLES[section]} className="space-y-1">
              {items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  badge={item.badge ? pendingCount : undefined}
                />
              ))}
            </nav>
          </div>
        ))}
        <div className="mt-auto border-t border-[var(--border)] pt-4">
          <p className="text-sm font-semibold">
            {actor?.name ?? "Votre espace"}
          </p>
          <p className="mt-1 text-xs text-[#626269]">
            {actor ? roleLabel(actor) : ""}
          </p>
          <SignOutButton className="mt-3 min-h-11 text-xs text-[#626269] underline underline-offset-4 hover:text-[#242428]" />
        </div>
      </aside>
      <div className="lg:pl-[232px]">
        <header className="sticky top-0 z-10 flex h-[62px] items-center justify-between gap-3 border-b border-[var(--border)] bg-white px-5 md:px-8">
          <div className="hidden min-w-0 truncate text-xs text-[#626269] sm:block">
            RIMCO Motors <span className="px-2 text-[#c5c5ca]">/</span>
            <span className="font-semibold text-[#242428]">{page}</span>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <GenerationIndicator />
            <NotificationBell />
            <SignOutButton className="min-h-11 rounded-md px-2 text-xs text-[#626269] underline underline-offset-4 hover:text-[#242428] lg:hidden" />
          </div>
        </header>
        <nav
          aria-label="Navigation principale"
          className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-white px-3 py-2 lg:hidden"
        >
          {visibleNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              mobile
              badge={item.badge ? pendingCount : undefined}
            />
          ))}
        </nav>
        <main id="main" className="mx-auto max-w-[1440px] p-5 md:px-8 md:py-8">
          <ActionRequiredBanner />
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * « Se déconnecter »: the server closes the Supabase session, then a full page load goes to the login page, so no
 * state of the previous account (notifications, generations being followed) stays in memory.
 */
function SignOutButton({ className }: { className: string }) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => undefined);
    // A full load on purpose: router.push would keep the previous account's profile and notifications in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/connexion");
  }
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={busy}
      className={className}
    >
      {busy ? "Déconnexion…" : "Se déconnecter"}
    </button>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-[var(--brand-red)]">
          {eyebrow}
        </p>
        <h1 className="text-[34px] leading-tight tracking-[-.02em] md:text-[42px]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="border border-[var(--border)] bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--muted)]">
        {label}
      </p>
      <div className="mt-4 flex items-end justify-between">
        <strong className="text-[27px] font-semibold tracking-[-.04em]">
          {value}
        </strong>
        {accent && (
          <span className="bg-[#fae9e8] px-2.5 py-1 text-xs font-semibold text-[#9c2822]">
            {accent}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-[var(--muted)]">{sub}</p>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  // A label always says the state; the colour only supports it (DESIGN.md). « Validée » alone is green.
  const colors: Record<string, string> = {
    Validée: "bg-[#e9f2eb] text-[#42694a]",
    Prête: "bg-[#f0f4f7] text-[#253b4e]",
    "En validation": "bg-[#efeff1] text-[#55555d]",
    Refusée: "bg-[#fae9e7] text-[#9d352e]",
    "En cours": "bg-[#fae9e8] text-[#9c2822]",
    Génération: "bg-[#fae9e8] text-[#9c2822]",
    Validation: "bg-[#efeff1] text-[#55555d]",
    Brouillon: "bg-[#efeff1] text-[#55555d]",
    Échec: "bg-[#fae9e7] text-[#9d352e]",
    Annulée: "bg-[#efeff1] text-[#55555d]",
  };
  return (
    <span
      className={`inline-flex rounded-sm px-2.5 py-1 text-xs font-semibold ${colors[status] ?? "bg-[#efeff1] text-[#55555d]"}`}
    >
      {status}
    </span>
  );
}
