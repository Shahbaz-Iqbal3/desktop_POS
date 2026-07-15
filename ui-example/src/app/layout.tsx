import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "POS App — Desktop Point of Sale",
  description: "Offline-first POS for fabric & retail shops. Electron + React + SQLite.",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: "var(--pos-bg)", color: "var(--pos-text)" }}
      >
        <ThemeProvider>
          {children}
          <SonnerToaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--pos-elev)",
                border: "1px solid var(--pos-border)",
                color: "var(--pos-text)",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
