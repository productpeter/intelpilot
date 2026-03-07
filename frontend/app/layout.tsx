import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
