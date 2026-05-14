import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VaultBox — Custodial wallets",
  description: "Venmo of wallets — ETH Sepolia & Solana Devnet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
