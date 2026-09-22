import type { Metadata } from "next";
import "./globals.css";
import { SentryInit } from "@/components/SentryInit";
import { ToastProvider } from "@/components/Toast";
import { CommandPalette } from "@/components/CommandPalette";
import { RevealController } from "@/components/reveal-controller";

export const metadata: Metadata = {
  title: "Operations Dashboard · Scalar Digital",
};

// Applies a stored manual light/dark choice (components/ThemeToggle.tsx)
// before first paint - runs as a blocking inline script specifically so
// there's no flash of the wrong theme between the server-rendered (OS-
// preference) HTML and the client-applied override. Reads localStorage
// directly rather than waiting for React to hydrate, same reasoning as any
// no-flash theme script.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("scalar-theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&family=Public+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <SentryInit />
        <ToastProvider>
          {children}
          <CommandPalette />
          <RevealController />
        </ToastProvider>
      </body>
    </html>
  );
}
