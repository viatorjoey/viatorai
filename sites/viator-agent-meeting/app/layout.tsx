import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIATOR DIRECTING ROOM",
  description: "비아토르 AI 크리에이터 스튜디오 회의실",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "VIATOR DIRECTING ROOM", statusBarStyle: "black-translucent" },
};

export const viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
