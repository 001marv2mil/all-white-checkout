import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase";
import { EVENT, getTier } from "@/lib/skylounge-rooftop";
import { maskEmail } from "@/lib/skylounge-ticketing";
import CheckInPanel from "./CheckInPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your ticket | Atlanta Pulse",
  robots: { index: false, follow: false },
};

const DISPLAY_FONT = 'var(--font-display, "Playfair Display", Georgia, serif)';
const PAGE_BG = "radial-gradient(120% 80% at 50% 0%, #2a2016 0%, #140f0a 55%, #0c0a08 100%)";

interface TicketRow {
  code: string;
  tier: string;
  status: string;
  used_at: string | null;
  buyer_email: string | null;
  guest_name: string | null;
}

type Lookup =
  | { kind: "found"; ticket: TicketRow }
  | { kind: "missing" }
  | { kind: "unavailable" };

// A missing database config or a failed query is "unavailable", NOT "missing":
// at the door, telling a real ticket holder their ticket does not exist because
// of an outage would be wrong.
async function lookupTicket(code: string): Promise<Lookup> {
  if (!code) return { kind: "missing" };
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("awp_tickets")
      .select("code, tier, status, used_at, buyer_email, guest_name")
      .eq("code", code)
      .maybeSingle();
    if (error) return { kind: "unavailable" };
    if (!data) return { kind: "missing" };
    return { kind: "found", ticket: data as TicketRow };
  } catch {
    return { kind: "unavailable" };
  }
}

// Landing page for a scanned ticket QR. Guests see their ticket; door staff
// see the same page and check people in with the door PIN. This page is public
// to anyone holding the ticket link, so the buyer's email is masked here and is
// shown in full only in the PIN-gated door list and stats.
export default async function TicketPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const cleanCode = String(code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20);

  const lookup = await lookupTicket(cleanCode);

  const eventName = EVENT.name.trim();
  const eventDate = [EVENT.dateLabel, EVENT.timeLabel]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" · ");

  return (
    <div
      className="min-h-screen text-white flex items-center justify-center px-6 py-10"
      style={{ background: PAGE_BG }}
    >
      <div className="max-w-sm w-full">
        <p
          style={{ fontFamily: DISPLAY_FONT }}
          className="text-center text-[#e0b256] text-xs font-bold tracking-[0.3em] uppercase mb-2"
        >
          Atlanta Pulse
        </p>
        {eventName && (
          <h1
            style={{ fontFamily: DISPLAY_FONT }}
            className="text-center text-2xl font-black mb-6"
          >
            {eventName}
          </h1>
        )}

        {lookup.kind === "unavailable" && (
          <div className="bg-amber-500/10 border-2 border-amber-400/50 rounded-3xl p-8 text-center">
            <h2 style={{ fontFamily: DISPLAY_FONT }} className="text-2xl font-black text-amber-200 mb-2">
              Tickets are not available right now
            </h2>
            <p className="text-white/60 text-sm">
              We could not look up this ticket at the moment. Please wait a minute and reload the
              page. Your ticket has not been lost.
            </p>
          </div>
        )}

        {lookup.kind === "missing" && (
          <div className="bg-red-500/10 border-2 border-red-500/60 rounded-3xl p-8 text-center">
            <div className="text-5xl mb-4" aria-hidden="true">
              &#10005;
            </div>
            <h2 style={{ fontFamily: DISPLAY_FONT }} className="text-2xl font-black text-red-300 mb-2">
              Ticket not found
            </h2>
            <p className="text-white/60 text-sm">
              {cleanCode ? (
                <>
                  Code <span className="font-mono font-bold">{cleanCode}</span> doesn&apos;t match any
                  issued ticket.
                </>
              ) : (
                "That link doesn't include a ticket code."
              )}{" "}
              Check the code or the buyer&apos;s email receipt.
            </p>
          </div>
        )}

        {lookup.kind === "found" && (
          <CheckInPanel
            code={lookup.ticket.code}
            tierName={getTier(lookup.ticket.tier)?.name?.trim() || "Ticket"}
            guestName={lookup.ticket.guest_name}
            initialStatus={lookup.ticket.status === "used" ? "used" : "valid"}
            initialUsedAt={lookup.ticket.used_at}
            maskedEmail={maskEmail(lookup.ticket.buyer_email)}
            eventDate={eventDate}
          />
        )}
      </div>
    </div>
  );
}
