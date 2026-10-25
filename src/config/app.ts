// App-wide settings. Change them here, not in components.
export const appConfig = {
  name: "Expense Tracker",
  shortName: "Expenses",
  description: "Personal income and spending tracker with weekly reports.",
  // The short line under the name on the sign-in and sign-up pages.
  tagline: "Every cedi, in one place.",
  // Africa/Accra is UTC+0 all year (no daylight saving).
  timeZone: "Africa/Accra",
  // D-34: Resend's test sender. It can only email the Resend account
  // owner's own address. Change it once a domain is verified in Resend.
  emailFrom: "Expense Tracker <onboarding@resend.dev>",
  // DESIGN.md D-14: the week runs Monday to Sunday.
  weekStartsOn: "monday",
  // Brand colours, shared by the PWA manifest and the browser theme colour.
  themeColorLight: "#0B5D4B",
  themeColorDark: "#111413",
  backgroundColor: "#F4F5F2",
} as const;
