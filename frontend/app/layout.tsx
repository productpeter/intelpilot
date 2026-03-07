import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "IntelPilot — AI Startup Intelligence",
  description:
    "Continuous intelligence for the AI startup landscape. Real-time discovery, enrichment, and analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        {children}
        <Script
          src="https://cdn.jsdelivr.net/npm/marked@15/marked.min.js"
          strategy="beforeInteractive"
        />
        <Script src="/app.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
