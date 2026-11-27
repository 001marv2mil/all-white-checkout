import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Atlanta Pulse",
  description: "What Atlanta Pulse collects when you visit or buy tickets, and who it is shared with.",
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "What we collect",
    body: [
      "When you buy tickets: your name, email address, any guest names you type, the tickets you chose, the amount paid, and whether you asked to hear about future events.",
      "Card and wallet details are entered on Stripe's page. Atlanta Pulse never receives or stores your full card number.",
      "When you visit: standard technical information such as your IP address, browser and device type, and the pages you view.",
    ],
  },
  {
    title: "How we use it",
    body: [
      "To take your payment, create and email your tickets, check you in at the door, answer questions, prevent fraud, and measure whether our ads work.",
      "We email you about future events only if you leave that box checked. You can ask us to stop at any time.",
    ],
  },
  {
    title: "Advertising and the Meta Pixel",
    body: [
      "This site uses the Meta Pixel. It places cookies or similar identifiers and tells Meta (Facebook and Instagram) that you visited the event page, started checkout, or completed a purchase, including the order amount. Meta may use this to measure our ads and to show you ads.",
      "You can control this in your Facebook or Instagram ad preferences, or by blocking cookies and trackers in your browser.",
    ],
  },
  {
    title: "Who else receives information",
    body: [
      "Stripe (payments), Supabase (ticket records), Resend (ticket emails), Vercel (website hosting) and Meta (advertising measurement).",
      "Ticket QR codes are drawn by api.qrserver.com, which receives the ticket link. The event page also loads content from YouTube, Google Fonts, unpkg and Esri map tiles, which receive your IP address.",
      "We do not sell your name or email address. We may disclose information if the law requires it.",
    ],
  },
  {
    title: "Keeping and deleting your information",
    body: [
      "We keep order records for as long as needed for the event, bookkeeping, disputes and legal duties. You can ask to see, correct or delete your information.",
    ],
  },
  {
    title: "Age",
    body: ["This event and website are for adults 21 and over."],
  },
  {
    title: "Contact",
    body: ["For any privacy request, contact Atlanta Pulse using the support details shown on your Stripe payment receipt."],
  },
];

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#0c0a08", color: "#f6efe2", padding: "40px 16px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", lineHeight: 1.65 }}>
        <p style={{ color: "#fb6904", fontWeight: 800, letterSpacing: "0.2em", fontSize: 12 }}>ATLANTA PULSE</p>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "8px 0" }}>Privacy Policy</h1>
        <p style={{ opacity: 0.6, fontSize: 13 }}>Last updated November 27, 2026</p>
        {SECTIONS.map((s) => (
          <section key={s.title} style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{s.title}</h2>
            {s.body.map((p) => (
              <p key={p} style={{ marginBottom: 10, opacity: 0.85 }}>
                {p}
              </p>
            ))}
          </section>
        ))}
        <p style={{ marginTop: 32 }}>
          <Link href="/skylounge-rooftop" style={{ color: "#fb6904" }}>
            &larr; Back to the event page
          </Link>
        </p>
      </div>
    </main>
  );
}
