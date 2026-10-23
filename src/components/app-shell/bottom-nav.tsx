"use client";

import { BarChart3, House, LayoutGrid, List, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: House },
  { href: "/activity", label: "Activity", icon: List },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/more", label: "More", icon: LayoutGrid },
] as const;

function isActive(pathname: string | null, href: string) {
  if (pathname === null) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// The menu at the bottom of every signed-in page (mockup screens 1–8).
// The round "+" button in the middle opens the Add screen.
//
// Highlighting the current tab needs the page address. On pages whose
// address holds an id (e.g. /accounts/[id]) that is only known per request,
// so the highlighted menu sits in a Suspense boundary; until it arrives the
// same menu shows without a highlight (Cache Components rule, see the
// usePathname docs).
export function BottomNav() {
  return (
    <Suspense fallback={<NavBar pathname={null} />}>
      <ActiveNavBar />
    </Suspense>
  );
}

function ActiveNavBar() {
  return <NavBar pathname={usePathname()} />;
}

function NavBar({ pathname }: { pathname: string | null }) {
  const [home, activity, reports, more] = items;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 pt-2 pb-3">
        <NavLink item={home} active={isActive(pathname, home.href)} />
        <NavLink item={activity} active={isActive(pathname, activity.href)} />
        <Link
          href="/add"
          aria-label="Add transaction"
          aria-current={isActive(pathname, "/add") ? "page" : undefined}
          className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Plus className="size-7" strokeWidth={2.4} aria-hidden="true" />
        </Link>
        <NavLink item={reports} active={isActive(pathname, reports.href)} />
        <NavLink item={more} active={isActive(pathname, more.href)} />
      </div>
    </nav>
  );
}

function NavLink({
  item,
  active,
}: {
  item: (typeof items)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-[22px]" aria-hidden="true" />
      {item.label}
    </Link>
  );
}
