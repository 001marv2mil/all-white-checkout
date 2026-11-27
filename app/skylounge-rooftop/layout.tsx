import type { Metadata } from "next";
import "./skylounge.css";

export const metadata: Metadata = {
  title: "All White R&B Rooftop — Atlanta Pulse",
  description:
    "All White R&B Rooftop by Atlanta Pulse. Sunday, December 13, 2026, 5–9 PM at SkyLounge at The Glenn Hotel. Tickets from $35.",
  openGraph: {
    title: "All White R&B Rooftop — Atlanta Pulse",
    description: "Atlanta's premier R&B experience.",
    type: "website",
  },
};

export default function SkyloungeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,700;1,800;1,900&family=Manrope:wght@400;500;600;700;800&display=swap"
      />
      {children}
    </>
  );
}
