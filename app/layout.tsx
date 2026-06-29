import type { Metadata } from "next";
import { Inter, Montserrat, Playfair_Display, Kaushan_Script } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-heading", weight: ["700", "800", "900"], display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-display", weight: ["700", "800", "900"], display: "swap" });
const kaushan = Kaushan_Script({ subsets: ["latin"], variable: "--font-script", weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: "All White R&B Night · Tampa",
  description: "Tampa's premier All White R&B Night. July 25, 2026 at Social Club.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable} ${playfair.variable} ${kaushan.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
