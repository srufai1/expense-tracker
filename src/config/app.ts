// App-wide settings. Change them here, not in components.
export const appConfig = {
  name: "Expense Tracker",
  shortName: "Expenses",
  description: "Personal income and spending tracker with weekly reports.",
  // Africa/Accra is UTC+0 all year (no daylight saving).
  timeZone: "Africa/Accra",
  // DESIGN.md D-14: the week runs Monday to Sunday.
  weekStartsOn: "monday",
  // Brand colours, shared by the PWA manifest and the browser theme colour.
  themeColorLight: "#0B5D4B",
  themeColorDark: "#111413",
  backgroundColor: "#F4F5F2",
} as const;
