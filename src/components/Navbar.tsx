"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LogOut,
  Menu,
  Search,
  Swords,
  User as UserIcon,
  X,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { cn } from "@/lib/cn";
import { LoginModal } from "@/components/auth/LoginModal";
import { Avatar, Button, buttonStyles, Skeleton } from "@/components/ui";

const NAV_LINKS = [
  { href: "/standings", label: "Standings" },
  { href: "/docs", label: "Docs" },
  { href: "/contact", label: "Contact" },
];

interface ActiveRoom {
  code: string;
  status: string;
  contest?: { name?: string | null } | null;
}

/**
 * Sticky top bar.
 *
 * Below `md` the links collapse into a slide-down sheet and search becomes a
 * full-width field inside it. The previous version rendered every link plus an
 * expanding 240px search box in one non-wrapping row, which overflowed the
 * viewport on any phone.
 */
export const Navbar: React.FC = () => {
  const { user, loading, logout } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close transient UI on navigation.
  //
  // Adjusted during render rather than in an effect: React re-runs this pass
  // before touching the DOM, so the menus never paint open on the new page.
  // An effect would close them a frame late, and would be an extra render.
  const [pathAtRender, setPathAtRender] = useState(pathname);
  if (pathAtRender !== pathname) {
    setPathAtRender(pathname);
    setMenuOpen(false);
    setAccountOpen(false);
    setSearchOpen(false);
  }

  // Lock scroll behind the mobile sheet.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  // Outside-click / Escape for the popovers.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(target)) {
        setAccountOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSearchOpen(false);
      setAccountOpen(false);
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Poll for a duel the user left open in another tab.
  useEffect(() => {
    // Nothing to poll while signed out. The banner is gated on `user` at
    // render time too, so a stale room from a previous session can't show —
    // clearing it here would only be a synchronous setState in an effect.
    if (!user) return;

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/users/active-room", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { room: ActiveRoom | null };
        if (!cancelled) setActiveRoom(data.room);
      } catch {
        /* transient — try again next tick */
      }
    };

    void check();
    const id = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  const runSearch = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = query.trim();
      if (!q) return;
      router.push(`/profile/${encodeURIComponent(q)}`);
      setQuery("");
      setSearchOpen(false);
      setMenuOpen(false);
    },
    [query, router],
  );

  const inRoom = pathname.startsWith("/arena") || pathname.startsWith("/room");
  const showActiveBanner = Boolean(user) && Boolean(activeRoom) && !inRoom;

  return (
    <>
      <div className="sticky top-0 z-50 w-full">
        {/* ── Active duel banner ─────────────────────────────────────────── */}
        {showActiveBanner && activeRoom && (
          <Link
            href={
              activeRoom.status === "WAITING"
                ? `/room/${activeRoom.code}`
                : `/arena/${activeRoom.code}`
            }
            className="flex items-center justify-center gap-3 bg-ink px-4 py-2 text-center text-[0.72rem] font-extrabold tracking-[0.06em] text-ink-invert uppercase no-underline sm:text-xs"
          >
            <span className="truncate">
              Duel in progress · {activeRoom.contest?.name || "Match"} (
              {activeRoom.code})
            </span>
            <span className="shrink-0 rounded-full bg-canvas px-3 py-1 text-[0.65rem] font-extrabold text-ink">
              REJOIN
            </span>
          </Link>
        )}

        {/* ── Bar ────────────────────────────────────────────────────────── */}
        <header className="flex h-16 w-full items-center gap-3 border-b border-white/6 bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 no-underline"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              className="size-8 rounded-full object-cover"
            />
            {/* Two-tone wordmark: the split now reads through weight/luminance
                rather than the old green accent. */}
            <span className="text-lg font-extrabold tracking-tight text-ink">
              ALGO<span className="font-light text-ink-dim">RIUM</span>
            </span>
          </Link>

          {/* Desktop links */}
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-3.5 py-2 text-[0.83rem] font-semibold no-underline transition-colors",
                  pathname === link.href
                    ? "bg-white/8 text-ink"
                    : "text-ink-dim hover:bg-white/5 hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop search */}
          <div
            ref={searchRef}
            className="relative ml-1 hidden items-center md:flex"
          >
            <form
              onSubmit={runSearch}
              className={cn(
                "overflow-hidden transition-all duration-200",
                searchOpen ? "w-56 opacity-100" : "w-0 opacity-0",
              )}
            >
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search a player…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-full rounded-full border border-line-strong bg-elevated px-4 text-[0.82rem] text-ink outline-none placeholder:text-ink-faint focus:border-ink-faint"
              />
            </form>
            <button
              type="button"
              aria-label={searchOpen ? "Search" : "Open search"}
              onClick={() => {
                if (searchOpen && query.trim()) {
                  runSearch();
                } else {
                  setSearchOpen((v) => !v);
                  setTimeout(() => searchInputRef.current?.focus(), 60);
                }
              }}
              className="flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-dim transition-colors hover:text-ink"
            >
              <Search className="size-4" />
            </button>
          </div>

          {/* Account / sign in */}
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {loading ? (
              <Skeleton className="size-9 rounded-full" />
            ) : user ? (
              <div ref={accountRef} className="relative">
                <button
                  type="button"
                  aria-label="Account menu"
                  aria-expanded={accountOpen}
                  onClick={() => setAccountOpen((v) => !v)}
                  className="flex cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent p-0.5"
                >
                  <Avatar src={user.avatar} alt={user.handle} size="sm" />
                </button>

                {accountOpen && (
                  <div className="absolute right-0 z-50 mt-2 flex w-56 animate-fade-in flex-col overflow-hidden rounded-lg border border-line bg-elevated p-1.5 shadow-pop">
                    <div className="border-b border-white/6 px-3 py-2.5">
                      <p className="truncate text-sm font-bold text-ink">
                        {user.handle}
                      </p>
                      <p className="mt-0.5 font-mono text-[0.7rem] text-ink-faint">
                        {user.elo} Elo · CF {user.rating || "unrated"}
                      </p>
                    </div>
                    <Link
                      href={`/profile/${encodeURIComponent(user.handle)}`}
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-semibold text-ink no-underline transition-colors hover:bg-white/6"
                    >
                      <UserIcon className="size-4" />
                      My profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        void logout();
                        setAccountOpen(false);
                        router.push("/");
                      }}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-3 py-2.5 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setLoginOpen(true)}
                icon={<Swords className="size-3.5" />}
              >
                <span className="hidden xs:inline">Sign in with CF</span>
                <span className="xs:hidden">Sign in</span>
              </Button>
            )}

            {/* Mobile menu toggle */}
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink md:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </header>

        {/* ── Mobile sheet ───────────────────────────────────────────────── */}
        {menuOpen && (
          <div className="animate-fade-in border-b border-white/8 bg-canvas px-4 pt-3 pb-5 md:hidden">
            <form onSubmit={runSearch} className="mb-3 flex gap-2">
              <input
                type="text"
                placeholder="Search a player…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-elevated px-4 text-ink outline-none placeholder:text-ink-faint focus:border-ink-faint"
              />
              <Button type="submit" variant="secondary" size="md" aria-label="Search">
                <Search className="size-4" />
              </Button>
            </form>

            <nav className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-3.5 text-base font-semibold no-underline transition-colors",
                    pathname === link.href
                      ? "bg-white/8 text-ink"
                      : "text-ink-dim hover:bg-white/5 hover:text-ink",
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/create"
                onClick={() => setMenuOpen(false)}
                className={buttonStyles({
                  variant: "primary",
                  size: "md",
                  fullWidth: true,
                  className: "mt-3",
                })}
              >
                Host a duel
              </Link>
            </nav>
          </div>
        )}
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
};
