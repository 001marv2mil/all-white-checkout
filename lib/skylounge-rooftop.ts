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
  /** Short line under the tier name in the ticket sheet. */
  tag: string;
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
  name: "All White R&B Rooftop",
  kicker: "Good people · Good vibes · Good times",
  tagline: "Atlanta's premier R&B rooftop experience.",
  headliner: "",
  dateLabel: "Sunday, December 13, 2026",
  timeLabel: "5 PM to 9 PM",
  flyerImage: "",
  venue: "SkyLounge at The Glenn Hotel",
  address: "110 Marietta St NW, Atlanta, GA 30303",
  lat: 33.7570128,
  lng: -84.39298,
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=110%20Marietta%20St%20NW%20Atlanta%20GA%2030303",
  dressCode: "All White",
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
    tag: "Limited release",
    name: "Early Bird GA",
    priceCents: 3500,
    blurb: "Limited release. Same great night, lowest price. Once they're gone, they're gone.",
    badge: "Limited",
    capacity: 30,
    sold: 0,
  },
  {
    id: "ga",
    tag: "The Pulse Experience",
    name: "General Admission",
    priceCents: 5000,
    blurb: "The full All White R&B Night experience. Music, dancing, and the whole vibe.",
    badge: "Most Popular",
    capacity: 74,
    sold: 0,
  },
  {
    id: "vip",
    tag: "Skip the line · VIP lounge · welcome drink on us",
    name: "VIP Lounge",
    priceCents: 10000,
    blurb: "Skip the line, sip in style. The premium way to do the night.",
    capacity: 18,
    sold: 0,
  },
  {
    id: "founder",
    tag: "Seat at the DJ table",
    name: "Founder's Seat",
    priceCents: 15000,
    blurb: "The ultimate all-white experience. Reserved seating, premier service, and exclusive perks.",
    badge: "Premium",
    capacity: 3,
    sold: 0,
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
    a: "All white is the move. It's a December evening in Atlanta, so layer up: white blazers, knits, coats, sleek dresses, suits and clean white sneakers all work. Avoid dark undertones, costumes, or bathing suits. White-adjacent (cream, ivory) is fine, just keep it all white.",
  },
  {
    q: "How do I get my tickets?",
    a: "Tickets are delivered instantly by email as mobile e-tickets right after checkout. Just bring the QR code on your phone (or printed) to scan at the door.",
  },
  {
    q: "Can I pay with Apple Pay or Google Pay?",
    a: "Yes, checkout supports Apple Pay, Google Pay, and all major credit/debit cards for a fast, secure purchase.",
  },
  {
    q: "Is there an age requirement?",
    a: "This event is 21 and up. Valid government-issued photo ID is required for entry.",
  },
  {
    q: "What's the refund policy?",
    a: "All ticket sales are final and non-refundable, but tickets can be transferred to a friend at no charge if you can no longer attend.",
  },
  {
    q: "Where is it and is there parking?",
    a: "We're at SkyLounge at The Glenn Hotel, 110 Marietta St NW, Atlanta, GA 30303, in downtown Atlanta. For parking, check with the hotel or use a nearby downtown garage.",
  },
];

/** VIP sections are booked by text, not through checkout. */
export const VIP_SECTION = {
  enabled: false,
  price: "$600",
  description:
    "8–12 people · $600 flat · includes a $200 hosted bar tab, a dedicated cocktail server, priority check-in, and a private photo set.",
  scarcity: "Only 3 sections available, booked directly by text, not through online checkout.",
  contacts: [] as { label: string; phone: string }[],
};
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
