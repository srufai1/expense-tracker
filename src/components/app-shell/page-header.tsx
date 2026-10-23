import type { ReactNode } from "react";

// The title row at the top of each signed-in page.
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-11 items-center justify-between gap-3">
      <h1 className="text-[22px] font-extrabold tracking-tight">{title}</h1>
      {actions}
    </header>
  );
}
