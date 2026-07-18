import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "SignalMind | AI Stock Analysis & Trading Dashboard",
  description: "Next-generation quantitative trading with live trade tracking and automated weekly AI self-optimization feedback loops.",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col md:flex-row bg-neutral-950 text-neutral-100 font-sans">
        <Sidebar />
        <main className="flex-1 w-full min-h-screen md:pr-64 transition-all duration-300 flex flex-col overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
