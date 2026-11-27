// Shared ticket-issuing pipeline: given a Stripe checkout session ID, verify it
// with Stripe directly, record the order, mint one coded ticket per seat, and
// email the buyer their QR e-tickets.
//
// Called from TWO independent places so a buyer always gets their tickets:
//   1. the Stripe webhook (fires even if the buyer closes the browser)
//   2. the success page   (fires even if the webhook delivery fails)
// Idempotent: the order's primary key is the session id, so whichever path
// runs second becomes a no-op.
//
// Issuance deliberately does NOT depend on EVENT.status: a paid session must
// still get its tickets even if the event is later marked sold-out or canceled.
import Stripe from "stripe";
import { Resend } from "resend";
import { getSupabaseAdmin } from "./supabase";
import { EVENT, EVENT_KEY, admitsOf, getTier, maxPerOrderOf, type TierId } from "./skylounge-rooftop";
import { SITE_URL, generateTicketCode, ticketQrUrl, ticketUrl } from "./skylounge-ticketing";

export interface IssueResult {
  issued: number;
  skipped?: string;
  error?: string;
}

const DEFAULT_EMAIL_FROM = "Atlanta Pulse <onboarding@resend.dev>";

interface IssuedTicket {
  code: string;
  tier: TierId;
  tierName: string;
  guestName: string | null;
}

type AdminDb = ReturnType<typeof getSupabaseAdmin>;

export async function issueTicketsForSession(sessionId: string): Promise<IssueResult> {
  try {
    return await issue(sessionId);
  } catch (err) {
    // Unexpected failure (network, etc.). Report it so the webhook returns 500
    // and Stripe retries; the order-first gate keeps retries safe.
    return { issued: 0, error: err instanceof Error ? err.message : "Ticket issuance failed." };
  }
}

async function issue(sessionId: string): Promise<IssueResult> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return { issued: 0, error: "Stripe is not configured." };
  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
    return { issued: 0, error: "Invalid session id." };
  }

  let db: AdminDb;
  try {
    db = getSupabaseAdmin();
  } catch {
    return { issued: 0, error: "Database is not configured." };
  }

  const stripe = new Stripe(secretKey, { maxNetworkRetries: 2 });

  // Authoritative copy from Stripe: never trust caller-supplied session data.
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return { issued: 0, error: "Unknown session." };
  }

  // A paid session from another site on the same Stripe account must never mint tickets here.
  if (session.metadata?.event !== EVENT_KEY) return { issued: 0, skipped: "different event" };

  if (session.status !== "complete") return { issued: 0, skipped: "session not complete" };
  // "no_payment_required" covers $0 totals (100%-off promo codes)
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    return { issued: 0, skipped: "not paid" };
  }

  let items: { id: TierId; qty: number }[] = [];
  try {
    items = JSON.parse(session.metadata?.items ?? "[]");
  } catch {
    /* fall through to empty */
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { issued: 0, skipped: "no items metadata" };
  }

  const email = session.customer_details?.email ?? session.customer_email ?? null;
  // Prefer the name typed on the ticket sheet; card name is the fallback
  // ($0 promo checkouts skip the card form entirely, so it can be missing).
  const buyerName = session.metadata?.buyerName?.trim() || session.customer_details?.name || null;
  const phone = session.customer_details?.phone ?? null;
  // Stored only on an explicit opt-in. Our checkout always writes "true" or "false".
  const newsletterOptIn = session.metadata?.newsletterOptIn === "true";

  let guestNames: string[] = [];
  try {
    const parsed = JSON.parse(session.metadata?.guestNames ?? "[]");
    if (Array.isArray(parsed)) guestNames = parsed.map((g) => String(g ?? "").trim().slice(0, 80));
  } catch {
    /* optional */
  }

  // Ticket 1 carries the buyer's name; extra tickets take the guest names the
  // buyer typed (in order), blank where they skipped one. Built before touching
  // the database so a session with nothing valid in it never creates an order.
  const tickets: IssuedTicket[] = [];
  let seat = 0;
  for (const item of items) {
    const tier = getTier(String(item?.id));
    if (!tier) continue;
    const qty = Math.max(1, Math.min(maxPerOrderOf(tier), Math.floor(Number(item.qty)) || 1));
    // A pack mints one ticket per person, recorded as the underlying tier.
    const ticketTier = getTier(tier.issuesAs ?? tier.id) ?? tier;
    for (let i = 0; i < qty * admitsOf(tier); i++) {
      const guestName = seat === 0 ? buyerName : guestNames[seat - 1] || null;
      tickets.push({
        code: generateTicketCode(),
        tier: ticketTier.id,
        tierName: ticketTier.name.trim() || "Ticket",
        guestName,
      });
      seat++;
    }
  }
  if (tickets.length === 0) return { issued: 0, skipped: "no valid tickets in session" };

  // Idempotency gate: insert the order first; a duplicate key means another
  // path already issued this session's tickets.
  const { error: orderError } = await db.from("awp_orders").insert({
    session_id: session.id,
    email,
    name: buyerName,
    phone,
    amount_total: session.amount_total,
    newsletter_opt_in: newsletterOptIn,
  });
  if (orderError) {
    if (orderError.code === "23505") return { issued: 0, skipped: "already issued" };
    return { issued: 0, error: `Order insert failed: ${orderError.message}` };
  }

  const ticketErrorMessage = await insertTickets(db, session.id, email, tickets);
  if (ticketErrorMessage) {
    // Roll the order back so a retry (Stripe webhook retry or a success-page
    // reload) can issue again instead of seeing "already issued" with no tickets.
    try {
      await db.from("awp_orders").delete().eq("session_id", session.id);
    } catch {
      /* best effort */
    }
    return { issued: 0, error: `Ticket insert failed: ${ticketErrorMessage}` };
  }

  if (email) await sendTicketEmail(email, buyerName, tickets);

  return { issued: tickets.length };
}

async function insertTickets(
  db: AdminDb,
  sessionId: string,
  email: string | null,
  tickets: IssuedTicket[]
): Promise<string | null> {
  try {
    const { error } = await db.from("awp_tickets").insert(
      tickets.map((t) => ({
        code: t.code,
        session_id: sessionId,
        tier: t.tier,
        buyer_email: email,
        guest_name: t.guestName,
      }))
    );
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : "unknown error";
  }
}

// Ticket email failures must never fail issuance: the tickets already exist and
// the buyer can still be looked up at the door by email.
async function sendTicketEmail(
  email: string,
  buyerName: string | null,
  tickets: IssuedTicket[]
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.AWP_EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM,
      to: email,
      subject: `Your ticket${tickets.length > 1 ? "s" : ""} for ${eventTitle()}`,
      html: ticketEmailHtml(buyerName, tickets),
      text: ticketEmailText(buyerName, tickets),
    });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Email content. Everything is built from EVENT config; empty fields are
// omitted. Every interpolated value goes through escapeHtml.
// ---------------------------------------------------------------------------

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function eventTitle(): string {
  return EVENT.name.trim() || "Atlanta Pulse";
}

function whenLine(): string {
  return [EVENT.dateLabel, EVENT.timeLabel]
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join(" · ");
}

function whereLine(): string {
  return [EVENT.venue, EVENT.address]
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join(" — ");
}

function firstName(name: string | null): string {
  if (!name) return "";
  return name.trim().split(/\s+/)[0] || "";
}

function infoNotes(): string[] {
  const notes: string[] = [];
  if (EVENT.minAge !== null && EVENT.minAge > 0) notes.push(`This is a ${EVENT.minAge}+ event.`);
  if (nonEmpty(EVENT.parkingNote)) notes.push(EVENT.parkingNote.trim());
  if (nonEmpty(EVENT.refundPolicy)) notes.push(EVENT.refundPolicy.trim());
  return notes;
}

function ticketEmailHtml(name: string | null, tickets: IssuedTicket[]): string {
  const gold = "#e0b256";
  const goldHi = "#f7dfa0";
  const plural = tickets.length > 1 ? "s" : "";

  const ticketBlocks = tickets
    .map(
      (t, i) => `
      <div style="background:#17100a;border:1px solid rgba(224,178,86,0.45);border-radius:16px;padding:24px;margin:0 0 16px;text-align:center;">
        <p style="margin:0 0 4px;color:${gold};font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">Ticket ${i + 1} of ${tickets.length}</p>
        <p style="margin:0 0 ${t.guestName ? "4" : "16"}px;color:${goldHi};font-size:20px;font-weight:bold;">${escapeHtml(t.tierName)}</p>
        ${t.guestName ? `<p style="margin:0 0 16px;color:#f6efe2;font-size:14px;">Admit: <strong>${escapeHtml(t.guestName)}</strong></p>` : ""}
        <img src="${escapeHtml(ticketQrUrl(t.code))}" width="220" height="220" alt="QR code for ticket ${escapeHtml(t.code)}" style="display:block;margin:0 auto 12px;border-radius:12px;background:#ffffff;padding:8px;" />
        <p style="margin:0 0 6px;color:#9c948a;font-size:12px;">Ticket code</p>
        <p style="margin:0 0 14px;color:#f6efe2;font-size:18px;font-weight:bold;letter-spacing:3px;">${escapeHtml(t.code)}</p>
        <a href="${escapeHtml(ticketUrl(t.code))}" style="color:${gold};font-size:12px;">View ticket online</a>
      </div>`
    )
    .join("");

  const detailLines = [whenLine(), whereLine()].filter((l) => l.length > 0).map(escapeHtml);
  const details = detailLines.length
    ? `<p style="margin:0 0 ${EVENT.mapsUrl ? "8" : "24"}px;color:#9c948a;font-size:14px;text-align:center;">${detailLines.join("<br />")}</p>`
    : "";
  const directions = EVENT.mapsUrl
    ? `<p style="margin:0 0 24px;text-align:center;"><a href="${escapeHtml(EVENT.mapsUrl)}" style="color:${gold};font-size:13px;">Get directions</a></p>`
    : "";
  const headliner = nonEmpty(EVENT.headliner)
    ? `<p style="margin:0 0 12px;color:${gold};font-size:13px;text-align:center;">${escapeHtml(EVENT.headliner.trim())}</p>`
    : "";
  const dressCode = nonEmpty(EVENT.dressCode)
    ? `<p style="margin:20px 0 0;color:${gold};font-size:13px;text-align:center;font-weight:bold;">${escapeHtml(EVENT.dressCode.trim())}</p>`
    : "";
  const notes = infoNotes()
    .map((n) => `<p style="margin:10px 0 0;color:#9c948a;font-size:12px;text-align:center;">${escapeHtml(n)}</p>`)
    .join("");

  const greeting = firstName(name) ? `Hey ${escapeHtml(firstName(name))},` : "Hey,";
  const siteHost = SITE_URL.replace(/^https?:\/\//i, "");

  return `
  <div style="background:#0a0705;padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;">
      <p style="margin:0 0 8px;color:${gold};font-size:11px;font-weight:bold;letter-spacing:3px;text-align:center;text-transform:uppercase;">Atlanta Pulse</p>
      <h1 style="margin:0 0 6px;color:${goldHi};font-size:26px;text-align:center;">${escapeHtml(eventTitle())}</h1>
      ${headliner}
      ${details}
      ${directions}
      <p style="margin:0 0 20px;color:#f6efe2;font-size:15px;">
        ${greeting} you're in! Show the QR code${plural} below at the door. From your phone is fine.
      </p>
      ${ticketBlocks}
      ${dressCode}
      ${notes}
      <p style="margin:16px 0 0;color:#6f6862;font-size:11px;text-align:center;">
        An event by Atlanta Pulse &middot; ${escapeHtml(siteHost)}
      </p>
    </div>
  </div>`;
}

function ticketEmailText(name: string | null, tickets: IssuedTicket[]): string {
  const lines: string[] = ["ATLANTA PULSE", eventTitle()];
  if (nonEmpty(EVENT.headliner)) lines.push(EVENT.headliner.trim());
  if (whenLine()) lines.push(whenLine());
  if (whereLine()) lines.push(whereLine());
  if (EVENT.mapsUrl) lines.push(`Directions: ${EVENT.mapsUrl}`);
  lines.push("");
  lines.push(
    `${firstName(name) ? `Hey ${firstName(name)},` : "Hey,"} you're in! Show the QR code${tickets.length > 1 ? "s" : ""} at the door. From your phone is fine.`
  );
  lines.push("");
  tickets.forEach((t, i) => {
    lines.push(`Ticket ${i + 1} of ${tickets.length}: ${t.tierName}`);
    if (t.guestName) lines.push(`Admit: ${t.guestName}`);
    lines.push(`Code: ${t.code}`);
    lines.push(`View online: ${ticketUrl(t.code)}`);
    lines.push("");
  });
  if (nonEmpty(EVENT.dressCode)) lines.push(EVENT.dressCode.trim());
  for (const note of infoNotes()) lines.push(note);
  lines.push("", `An event by Atlanta Pulse - ${SITE_URL.replace(/^https?:\/\//i, "")}`);
  return lines.join("\n");
}
