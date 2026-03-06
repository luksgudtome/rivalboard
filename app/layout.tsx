import type { Metadata } from "next";
import rivalboardLogo from "@/content/rivalboard-logo.png";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rivalboard",
  description: "Manage tournaments with account-based access",
  icons: {
    icon: rivalboardLogo.src,
    shortcut: rivalboardLogo.src,
    apple: rivalboardLogo.src,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Manrope:wght@500;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/brackets-viewer@1.9.0/dist/brackets-viewer.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
