import type { Metadata } from "next";
import "@fontsource-variable/archivo/wdth.css";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loupe — check what you were sent",
  description: "Images, documents, audio, video and claims. You get the evidence, not just a score.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-frame focus:p-2">Skip to content</a>
        <header className="flex items-center justify-between px-6 py-4 border-b border-rule">
          <Link href="/" className="wide text-[20px]">Loupe</Link>
          <nav className="flex gap-6 text-ink-soft">
            <Link href="/history" className="hover:text-ink">History</Link>
            <Link href="/how-it-works" className="hover:text-ink">How it works</Link>
          </nav>
        </header>
        <main id="main" className="px-6 py-8 max-w-[1200px] mx-auto">{children}</main>
      </body>
    </html>
  );
}
