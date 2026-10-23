import type { MetadataRoute } from "next";

import { appConfig } from "@/config/app";

// The PWA manifest (DESIGN.md D-22): lets the phone install the app on the
// home screen and open it full screen. Served at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.name,
    short_name: appConfig.shortName,
    description: appConfig.description,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: appConfig.backgroundColor,
    theme_color: appConfig.themeColorLight,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
