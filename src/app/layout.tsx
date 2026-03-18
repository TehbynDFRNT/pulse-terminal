import type { Metadata } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { AppBottomSheet } from '@/components/AppBottomSheet';
import { ChartDiagnosticsBootstrap } from '@/components/ChartDiagnosticsBootstrap';
import { LocalhostRedirect } from '@/components/LocalhostRedirect';
import { ThemeBootstrap } from '@/components/ThemeBootstrap';
import { getThemeInitScript } from '@/lib/theme';
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulse Terminal",
  description: "Trading execution terminal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} bg-background text-foreground antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: getThemeInitScript() }} />
        <ThemeBootstrap />
        <ChartDiagnosticsBootstrap />
        <LocalhostRedirect />
        {children}
        <AppBottomSheet />
      </body>
    </html>
  );
}
