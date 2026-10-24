import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "supabase/**/*.test.ts"],
    environment: "node",
    // Each database test file starts an in-memory Postgres (PGlite) and runs
    // every migration in beforeAll. With several files in parallel, plus
    // coverage, on a slow laptop, that setup can pass Vitest's default 10 s.
    // This limit is for setup hooks only; it changes no assertion.
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      // The app's logic lives in src/lib (money, reports, rules). Every new
      // file there is measured automatically, so it cannot ship untested.
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/**/*.test.ts",
        // Thin wrappers around Next.js and Supabase. They need a running
        // server and a real Supabase project, so unit tests cannot load them;
        // they are checked by the build and by hand. Keep logic out of them.
        "src/lib/auth.ts",
        "src/lib/utils.ts",
        "src/lib/supabase/client.ts",
        "src/lib/supabase/server.ts",
        "src/lib/supabase/proxy.ts",
        "src/lib/supabase/env.ts",
        "src/lib/supabase/admin.ts",
      ],
      // `npm run test:coverage` fails if tests cover less than this, checked
      // for each file (perFile), so one untested file cannot hide behind a
      // high total.
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90, perFile: true },
    },
  },
});
