// Browser security headers sent with every page (next.config.ts).
// - Frames: no other site may show the app inside a frame, so it cannot be
//   used to trick a click on a hidden button (clickjacking). Both headers,
//   for old and new browsers.
// - nosniff: the browser uses the file type the server says, never a guess.
// - Referrer: other sites see only the domain, never a page address.
// - HSTS: once seen over HTTPS, the browser never uses plain HTTP for two
//   years. Browsers ignore it on http://localhost.
// - Permissions: no microphone or location. The camera is not listed, so
//   taking a receipt photo keeps working.
// A full Content-Security-Policy is not set: Next.js adds inline scripts,
// and a wrong policy would break the app.
export const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "microphone=(), geolocation=()" },
] as const;
