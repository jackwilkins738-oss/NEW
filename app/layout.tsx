import type { Metadata } from "next";
import "./globals.css";
import { SentryInit } from "@/components/SentryInit";

export const metadata: Metadata = {
  title: "Operations Dashboard · Scalar Digital",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&family=Public+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="font-sans">
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
