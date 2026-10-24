"use client";

import type { ReactNode } from "react";

import { NativeSelect } from "@/components/native-select";

// The account filter applies as soon as an account is chosen.
export function AccountFilter({ value, children }: { value: string; children: ReactNode }) {
  return (
    <NativeSelect
      id="account"
      name="account"
      defaultValue={value}
      className="h-11"
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {children}
    </NativeSelect>
  );
}
