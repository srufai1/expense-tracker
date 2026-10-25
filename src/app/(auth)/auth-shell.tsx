import type { ReactNode } from "react";

import { appConfig } from "@/config/app";

// The frame shared by the sign-in and sign-up pages: a brand-green band with
// the app's icon, name and tagline (the same green as the Home balance card),
// and the page's form on a card that overlaps the band. Same in light and
// dark mode.
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="relative isolate overflow-hidden bg-gradient-to-br from-[#0E7A62] via-[#0B5D4B] to-[#06372C] px-6 pt-12 pb-24 text-white">
        <span className="absolute -top-20 -right-16 -z-10 size-64 rounded-full bg-white/10" aria-hidden="true" />
        <span className="absolute -bottom-28 -left-12 -z-10 size-64 rounded-full bg-white/5" aria-hidden="true" />
        <div className="mx-auto flex w-full max-w-sm items-center gap-4">
          {/* A plain <img>: a small local SVG needs no image optimisation. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" className="size-14 rounded-2xl shadow-lg ring-1 ring-white/25" />
          <div className="flex flex-col">
            <span className="text-xl font-extrabold tracking-tight">{appConfig.name}</span>
            <span className="text-sm opacity-80">{appConfig.tagline}</span>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-16 flex w-full max-w-sm flex-col gap-6 px-4 pb-10">
        <section className="flex flex-col gap-6 rounded-3xl border bg-card p-6 text-card-foreground shadow-xl">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {children}
        </section>
        {footer ? <p className="text-center text-sm text-muted-foreground">{footer}</p> : null}
      </div>
    </main>
  );
}
