import type { Metadata } from "next";
import "./globals.css";
import { SentryInit } from "@/components/SentryInit";

export const metadata: Metadata = {
  title: "Operations Dashboard · Scalar Digital",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline theme script below sets
    // data-theme on <html> before React hydrates, so the server HTML (which
    // can't know the viewer's stored choice) and the client DOM legitimately
    // differ by that one attribute. React only suppresses one level deep -
    // this element's own attributes, not its subtree - so real hydration
    // mismatches inside the app still surface.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&family=Public+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="font-sans">
        {/* Applies a saved theme choice before the first paint. Without this
            a viewer who picked dark sees a white flash on every navigation,
            because the server has no way to know their choice - it lives in
            their browser, not in the session. Deliberately tiny, synchronous
            and inline: anything deferred runs after paint, which is the
            whole problem. Wrapped in try/catch because localStorage throws
            in a private window with site data blocked. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("loft-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
