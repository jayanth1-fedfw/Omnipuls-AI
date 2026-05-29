import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omnipuls",
  description: "Customer work alert AI with database-backed automations."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
