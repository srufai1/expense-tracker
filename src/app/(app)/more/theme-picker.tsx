"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";

const options = [
  { value: "system", label: "Phone", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // The saved theme is only known in the browser, so nothing is shown as
  // selected until after the first render.
  const mounted = useMounted();
  const current = mounted ? (theme ?? "system") : undefined;

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
      {options.map(({ value, label, icon: Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              selected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
