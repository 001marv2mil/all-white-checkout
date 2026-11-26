// SkyLounge All White R&B Night: event + ticket configuration.
// Single source of truth for pricing. The checkout route reads prices FROM HERE
// on the server, so the client can never set its own price.

/** Stamped on every Stripe session so ticket issuance ignores payments from other sites. */
export const EVENT_KEY = "skylounge-rooftop";

export type TierId = "earlybird" | "ga" | "vip" | "founder";

/** on-sale = checkout open. Set to "sold-out" or "canceled" to close sales. */
export type EventStatus = "on-sale" | "sold-out" | "canceled";

export interface Tier {
  id: TierId;
  name: string;
  /** Price in cents. e.g. 2500 = $25.00 */
  priceCents: number;
  blurb: string;
  badge?: string;
  /** Manual close switch. */
  soldOut?: boolean;
  /** Total tickets in this tier. */
  capacity: number;
  /** Tickets already sold OUTSIDE this system (they are not in the database).
   *  Tickets sold through this checkout are counted live from the database. */
  sold: number;
}

export const EVENT = {
  status: "on-sale" as EventStatus,
  name: "All White R&B Night",
  kicker: "Good people · Good vibes · Good times",
  tagline: "Atlanta's premier R&B rooftop experience.",
  headliner: "",
  dateLabel: "Saturday, December 12, 2026",
  timeLabel: "5 PM to 9 PM",
  flyerImage: "",
  venue: "SkyLounge at The Glenn Hotel",
  address: "110 Marietta St NW, Atlanta, GA 30303",
  lat: 33.7570128,
  lng: -84.39298,
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=110%20Marietta%20St%20NW%20Atlanta%20GA%2030303",
  dressCode: "All-white linen",
  minAge: 21 as number | null,
  refundPolicy:
    "All ticket sales are final and non-refundable, but tickets can be transferred to a friend at no charge.",
  parkingNote: "",
  currency: "usd",
};

/** Max tickets a single buyer can purchase per tier in one order. */
export const MAX_PER_TIER = 10;

export const FEES = {
  label: "Service fee",
  percent: 0.1, // 10% of ticket subtotal
  perTicketCents: 150, // + $1.50 per ticket
};

export function computeFeeCents(subtotalCents: number, ticketCount: number): number {
  if (ticketCount <= 0) return 0;
  return Math.round(subtotalCents * FEES.percent) + FEES.perTicketCents * ticketCount;
}

export const TIERS: Tier[] = [
  {
    id: "earlybird",
    name: "Early Bird GA",
    priceCents: 2500,
    blurb: "Limited release. Same great night, lowest price. Once they're gone, they're gone.",
    badge: "Limited",
    capacity: 20,
    sold: 17,
  },
  {
    id: "ga",
    name: "General Admission",
    priceCents: 4000,
    blurb: "The full All White R&B Night experience. Music, dancing, and the whole vibe.",
    badge: "Most Popular",
    capacity: 75,
    sold: 41,
  },
  {
    id: "vip",
    name: "VIP Lounge",
    priceCents: 7500,
    blurb: "Skip the line, sip in style. The premium way to do the night.",
    capacity: 40,
    sold: 27,
  },
  {
    id: "founder",
    name: "Founder's Seat",
    priceCents: 15000,
    blurb: "The ultimate all-white experience. Reserved seating, premier service, and exclusive perks.",
    badge: "Premium",
    capacity: 7,
    sold: 3,
  },
];

export const LOW_STOCK_THRESHOLD = 25;

/** Static remaining count (capacity minus out-of-system sales). Live counts come from the database. */
export function tierRemaining(tier: Tier): number {
  return Math.max(0, tier.capacity - tier.sold);
}

export function isOnSale(): boolean {
  return EVENT.status === "on-sale";
}

export const FAQ: { q: string; a: string }[] = [
  {
    q: "What's the dress code?",
    a: "It's an all-white rooftop night in Atlanta, so think lightweight linen sets, breezy dresses, and crisp white fits. All-white linen is the move.",
  },
  {
    q: "How do I get my tickets?",
    a: "Tickets are delivered instantly by email as mobile e-tickets right after checkout. Just bring the QR code to the door from your phone.",
  },
  {
    q: "Can I pay with Apple Pay or Google Pay?",
    a: "Yes. Checkout supports Apple Pay, Google Pay, and all major credit/debit cards for a fast, secure payment.",
  },
  {
    q: "Is there an age requirement?",
    a: "This event is 21 and up. Valid government-issued photo ID is required for entry.",
  },
  {
    q: "What's the refund policy?",
    a: EVENT.refundPolicy,
  },
  {
    q: "Where is it?",
    a: "SkyLounge at The Glenn Hotel, 110 Marietta St NW, Atlanta, GA 30303.",
  },
];

export function getTier(id: string): Tier | undefined {
  return TIERS.find((t) => t.id === id);
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: EVENT.currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
