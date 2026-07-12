import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asli — proof at the point of listing",
  description:
    "A point-of-listing, multi-agent trust layer for Meesho: prove possession + real sizing before a listing goes live.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <I18nProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
