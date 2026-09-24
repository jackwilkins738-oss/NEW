import { Fraunces, Public_Sans, IBM_Plex_Mono } from "next/font/google";

// Self-hosted via next/font instead of the old <link> to fonts.googleapis.com
// in app/layout.tsx - removes the render-blocking request to Google at
// first paint and the "not added in pages/_document" lint warning that came
// with loading fonts via a raw <link> tag.
export const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  weight: "variable",
  variable: "--font-fraunces",
  display: "swap",
});

export const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-public-sans",
  display: "swap",
});

// Not a variable font on Google Fonts - weight must be an explicit array.
export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});
