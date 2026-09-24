import type { Metadata } from "next";
import "./globals.css";
import { fraunces, publicSans, ibmPlexMono } from "@/lib/fonts";
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
    <html lang="en" className={`${fraunces.variable} ${publicSans.variable} ${ibmPlexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <ToastProvider>
          {children}
          <CommandPalette />
          <RevealController />
        </ToastProvider>
      </body>
    </html>
  );
}
