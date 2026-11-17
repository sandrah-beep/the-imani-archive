import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Imani Archive — An archive of all things cute",
  description: "Curated pieces, beauty treats and little treasures. Because every girl deserves something cute."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
