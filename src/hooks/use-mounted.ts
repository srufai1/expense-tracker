import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// false during the server render and the first client render, true after.
// Use it for UI that depends on browser-only values (like the saved theme)
// so the server HTML and the first client render always match.
export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
