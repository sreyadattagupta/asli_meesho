import type { Metadata } from "next";
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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
