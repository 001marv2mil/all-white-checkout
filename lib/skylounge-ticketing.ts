// All White Party ticketing: sold counts, ticket codes, ticket links.
// Tables: awp_orders, awp_tickets (supabase/migrations/20261006_create_awp_ticketing.sql)
import { getSupabaseAdmin } from "./supabase";
import { TIERS, isOnSale, type TierId } from "./skylounge-rooftop";

const DEFAULT_SITE_URL = "http://localhost:3000"; // used only when no site URL env var is set

function resolveSiteUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "").trim();
  const base = configured || DEFAULT_SITE_URL;
  const withScheme = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  return withScheme.replace(/\/+$/, "");
}

export const SITE_URL = resolveSiteUrl();

/** Tickets sold per tier, straight from the database. */
export async function getSoldCounts(): Promise<Record<TierId, number>> {
  const counts: Record<TierId, number> = { earlybird: 0, ga: 0, vip: 0, founder: 0 };
  const db = getSupabaseAdmin();

  // One exact head-count per tier. (A plain select() is capped at 1000 rows by
  // PostgREST, which would silently undercount on a big sale.)
  const results = await Promise.all(
    TIERS.map(async (tier) => {
      const { count, error } = await db
        .from("awp_tickets")
        .select("id", { count: "exact", head: true })
        .eq("tier", tier.id);
      if (error) throw new Error(`Could not read ticket counts: ${error.message}`);
      return { id: tier.id, count: count ?? 0 };
    })
  );
  for (const r of results) counts[r.id] = r.count;
  return counts;
}

export interface TierAvailability {
  capacity: number | null;
  sold: number;
  remaining: number | null; // null = unlimited
}

/** Live availability per tier (capacity comes from TIERS config).
 *  A manual `soldOut: true`, or a tier with no price yet, forces remaining to 0. */
export async function getAvailability(): Promise<Record<TierId, TierAvailability>> {
  const sold = await getSoldCounts();
  const out = {} as Record<TierId, TierAvailability>;
  for (const tier of TIERS) {
    // tier.sold = tickets sold outside this system; the database holds the rest.
    const total = tier.sold + sold[tier.id];
    const closed = !isOnSale() || tier.soldOut === true || !(tier.priceCents > 0);
    out[tier.id] = {
      capacity: tier.capacity,
      sold: total,
      remaining: closed ? 0 : Math.max(0, tier.capacity - total),
    };
  }
  return out;
}
// Unambiguous alphabet: no 0/O, 1/I/L. 31 characters.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
// Largest multiple of the alphabet size that fits in a byte; bytes at or above
// it are discarded so every character is equally likely (no modulo bias).
const CODE_BYTE_LIMIT = 256 - (256 % CODE_ALPHABET.length);

/** Short, unambiguous, random ticket code. */
export function generateTicketCode(): string {
  let code = "";
  while (code.length < CODE_LENGTH) {
    const bytes = new Uint8Array(CODE_LENGTH * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= CODE_BYTE_LIMIT) continue;
      code += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (code.length === CODE_LENGTH) break;
    }
  }
  return code;
}

export function ticketUrl(code: string): string {
  return `${SITE_URL}/skylounge-rooftop/ticket/${encodeURIComponent(code)}`;
}

/** QR image URL for a ticket (rendered by the email client, not our CSP). */
export function ticketQrUrl(code: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(ticketUrl(code))}`;
}

/**
 * Masks an email for public display: "jane@gmail.com" -> "j***@gmail.com".
 * Never throws; anything that is not a usable email comes back as "" or "***".
 */
export function maskEmail(email: string | null | undefined): string {
  if (typeof email !== "string") return "";
  const value = email.trim();
  if (!value) return "";

  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return "***";

  const first = Array.from(value.slice(0, at))[0] ?? "";
  const domain = value.slice(at + 1);
  return `${first}***@${domain}`;
}
