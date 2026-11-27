import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import Stripe from "stripe";
import { EVENT, admitsOf, formatPrice, getTier, maxPerOrderOf } from "@/lib/skylounge-rooftop";
import { issueTicketsForSession } from "@/lib/skylounge-issue-tickets";
import { maskEmail } from "@/lib/skylounge-ticketing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order confirmed | Atlanta Pulse",
  robots: { index: false, follow: false },
};

const DISPLAY_FONT = 'var(--font-display, "Playfair Display", Georgia, serif)';
const PAGE_BG = "radial-gradient(120% 80% at 50% 0%, #2a2016 0%, #140f0a 55%, #0c0a08 100%)";
// Stripe Checkout Session ids look like cs_test_... / cs_live_... (alphanumeric).
const SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]{8,255}$/;

type Outcome =
  /** No usable session id in the URL. */
  | { kind: "none" }
  /** We could not confirm the payment with Stripe (not configured, or a lookup error). */
  | { kind: "unverified" }
  /** Stripe knows the session but it never completed. */
  | { kind: "incomplete" }
  /** Checkout finished but the payment has not cleared yet. */
  | { kind: "processing" }
  | {
      kind: "paid";
      maskedEmail: string;
      amountTotal: number | null;
      ticketCount: number;
      issueFailed: boolean;
    };

// Mirrors how lib/awp-issue-tickets.ts counts seats, so the email subject shown
// below (which includes a plural "s") matches the real email.
function countTickets(rawItems: string | undefined): number {
  let items: unknown;
  try {
    items = JSON.parse(rawItems ?? "[]");
  } catch {
    return 0;
  }
  if (!Array.isArray(items)) return 0;
  let total = 0;
  for (const item of items) {
    const entry = item as { id?: unknown; qty?: unknown } | null;
    const tier = entry ? getTier(String(entry.id)) : undefined;
    if (!entry || !tier) continue;
    total += admitsOf(tier) * Math.max(1, Math.min(maxPerOrderOf(tier), Math.floor(Number(entry.qty)) || 1));
  }
  return total;
}

// Stripe redirects here after payment with ?session_id=...
// We retrieve the session server-side to show a real confirmation, and run the
// ticket-issuing pipeline as a BACKUP to the webhook. Issuance is idempotent, so
// whichever of the two fires second is a no-op. Between them, a paying buyer
// always gets their e-tickets.
async function loadOutcome(sessionId: string): Promise<Outcome> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return { kind: "unverified" };

  let issueFailed = false;
  try {
    const result = await issueTicketsForSession(sessionId);
    issueFailed = Boolean(result.error);
  } catch {
    // Never block the confirmation page on issuance; the webhook still covers it.
    issueFailed = true;
  }

  try {
    const stripe = new Stripe(secretKey, { maxNetworkRetries: 2 });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.status !== "complete") return { kind: "incomplete" };
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      return { kind: "processing" };
    }

    return {
      kind: "paid",
      // Public page: never echo the full address back.
      maskedEmail: maskEmail(session.customer_details?.email ?? session.customer_email ?? null),
      amountTotal: session.amount_total ?? null,
      ticketCount: countTickets(session.metadata?.items),
      issueFailed,
    };
  } catch {
    // Fall back to a generic confirmation if retrieval fails.
    return { kind: "unverified" };
  }
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const { session_id } = await searchParams;
  const rawId = Array.isArray(session_id) ? session_id[0] : session_id;
  const sessionId = typeof rawId === "string" ? rawId.trim() : "";

  const outcome: Outcome = SESSION_ID_PATTERN.test(sessionId)
    ? await loadOutcome(sessionId)
    : { kind: "none" };

  const eventName = EVENT.name.trim();

  // The real subject built in lib/awp-issue-tickets.ts:
  // `Your ticket${plural} for ${EVENT.name || "Atlanta Pulse"}`
  const ticketCount = outcome.kind === "paid" ? outcome.ticketCount : 0;
  const emailSubject = `Your ticket${ticketCount > 1 ? "s" : ""} for ${eventName || "Atlanta Pulse"}`;

  const detailRows = [
    { label: "Date", value: EVENT.dateLabel.trim() },
    { label: "Time", value: EVENT.timeLabel.trim() },
    { label: "Where", value: EVENT.venue.trim() },
  ].filter((row) => row.value.length > 0);
  const address = EVENT.address.trim();
  const mapsUrl = EVENT.mapsUrl.trim();
  const dressCode = EVENT.dressCode.trim();

  if (outcome.kind === "paid") {
    const plural = outcome.ticketCount > 1;
    return (
      <Shell>
        <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundImage: "linear-gradient(135deg, #F0D488, #D4AF37)" }}>
          <svg
            className="w-8 h-8 text-[#1a1208]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 style={{ fontFamily: DISPLAY_FONT }} className="text-3xl font-black mb-3">
          You&apos;re in!
        </h1>
        <p className="text-white/60 text-sm leading-relaxed mb-4">
          {eventName ? (
            <>
              Your spot at <span className="text-white font-semibold">{eventName}</span> is locked in.
            </>
          ) : (
            "Your order is confirmed."
          )}{" "}
          Your QR-code e-ticket{plural ? "s are" : " is"} being emailed to{" "}
          <span className="text-white font-semibold">{outcome.maskedEmail || "you"}</span> right now.
        </p>

        {outcome.issueFailed && (
          <div role="status" className="bg-amber-500/10 border border-amber-400/40 rounded-xl px-4 py-3 mb-4 text-left">
            <p className="text-amber-200 text-xs font-bold uppercase tracking-wider mb-1">
              Your tickets are taking a moment
            </p>
            <p className="text-white/70 text-xs leading-relaxed">
              Your payment went through, but we hit a delay creating your tickets. Reload this page in
              a minute to try again. If they have not arrived after a few minutes, keep your Stripe
              receipt email and contact the organizer with it.
            </p>
          </div>
        )}

        <div className="bg-[#F0D488]/10 border border-[#D4AF37]/40 rounded-xl px-4 py-3 mb-6 text-left">
          <p className="text-[#F0D488] text-xs font-bold uppercase tracking-wider mb-1">
            Don&apos;t see the email?
          </p>
          <p className="text-white/70 text-xs leading-relaxed">
            Check your <span className="text-white font-semibold">Promotions</span> tab (Gmail) or{" "}
            <span className="text-white font-semibold">Spam / Junk</span> folder. It sometimes lands
            there. Look for{" "}
            <span className="text-white font-semibold">&quot;{emailSubject}&quot;</span> from
            Atlanta Pulse. Save it: the QR code inside is your entry at the door.
          </p>
        </div>

        {outcome.amountTotal !== null && (
          <div className="flex justify-between items-baseline border-y border-white/10 py-4 mb-6 text-sm">
            <span className="text-white/50">Total paid</span>
            <span style={{ fontFamily: DISPLAY_FONT }} className="font-black text-xl text-[#F0D488]">
              {formatPrice(outcome.amountTotal)}
            </span>
          </div>
        )}

        {(detailRows.length > 0 || address) && (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 mb-6 text-left space-y-2">
            {detailRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-4 text-sm">
                <span className="text-white/40">{row.label}</span>
                <span className="text-white font-medium text-right">{row.value}</span>
              </div>
            ))}
            {address &&
              (mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-4 text-sm pt-1 text-[#F0D488] hover:underline"
                >
                  <span className="text-white/40">Address</span>
                  <span className="text-right">{address} &middot; Map</span>
                </a>
              ) : (
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-white/40">Address</span>
                  <span className="text-white font-medium text-right">{address}</span>
                </div>
              ))}
          </div>
        )}

        {dressCode && <p className="text-[#F0D488] text-xs font-semibold mb-6">{dressCode}</p>}

        <BackLink />
      </Shell>
    );
  }

  // Everything below is a non-confirmed state: no "You're in" claim is made.
  let heading: string;
  let body: ReactNode;
  switch (outcome.kind) {
    case "processing":
      heading = "Payment processing";
      body =
        "Your payment has not finished processing yet. Reload this page in a minute to check again. Your e-tickets are emailed as soon as the payment is confirmed.";
      break;
    case "incomplete":
      heading = "Payment not completed";
      body =
        "We could not find a completed payment for this order, so no tickets have been issued. If you were not able to finish checking out, you can head back and try again.";
      break;
    case "unverified":
      heading = "Thanks for your order";
      body = (
        <>
          We could not confirm your payment status just now. If you completed checkout, your QR-code
          e-ticket is emailed to you. Look for an email from Atlanta Pulse titled{" "}
          <span className="text-white font-semibold">&quot;{emailSubject}&quot;</span> (&quot;Your
          tickets for&quot; if you bought more than one), and check your Promotions or Spam folder if
          it is not in your inbox.
        </>
      );
      break;
    default:
      heading = "Nothing to show here";
      body = "Open this page from the link at the end of checkout to see your order.";
  }

  return (
    <Shell>
      <h1 style={{ fontFamily: DISPLAY_FONT }} className="text-3xl font-black mb-3">
        {heading}
      </h1>
      <p className="text-white/60 text-sm leading-relaxed mb-6">{body}</p>
      <BackLink />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen text-white flex items-center justify-center px-6 py-10"
      style={{ background: PAGE_BG }}
    >
      <div className="max-w-md w-full bg-[#15100b]/80 border border-[#D4AF37]/25 rounded-3xl p-8 sm:p-10 text-center">
        <p
          style={{ fontFamily: DISPLAY_FONT }}
          className="text-[#e0b256] text-xs font-bold tracking-[0.3em] uppercase mb-6"
        >
          Atlanta Pulse
        </p>
        {children}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/skylounge-rooftop" className="inline-block text-white/50 hover:text-white text-sm transition-colors">
      &larr; Back to the event page
    </Link>
  );
}
