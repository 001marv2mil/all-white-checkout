import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  EVENT,
  EVENT_KEY,
  FEES,
  MAX_PER_TIER,
  admitsOf,
  computeFeeCents,
  getTier,
  isOnSale,
  maxPerOrderOf,
} from "@/lib/skylounge-rooftop";
import { SITE_URL, getAvailability } from "@/lib/skylounge-ticketing";

export const runtime = "nodejs";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  if (!isOnSale()) return fail("Ticket sales are closed for this event.", 409);

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return fail("Checkout is not configured yet.", 503);

  let body: { items?: unknown; email?: unknown; name?: unknown; guestNames?: unknown; newsletterOptIn?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request.", 400);
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return fail("Pick at least one ticket.", 400);
  }

  // Merge duplicate tiers, then validate each one against the server config.
  const wanted = new Map<string, number>();
  for (const raw of body.items) {
    const item = raw as { id?: unknown; qty?: unknown } | null;
    const qty = Number(item?.qty);
    if (!item || typeof item.id !== "string" || !Number.isInteger(qty) || qty < 1) {
      return fail("Invalid ticket selection.", 400);
    }
    wanted.set(item.id, (wanted.get(item.id) ?? 0) + qty);
  }

  // Inventory must be readable: never sell tickets blind.
  let availability: Awaited<ReturnType<typeof getAvailability>>;
  try {
    availability = await getAvailability();
  } catch {
    return fail("Ticket inventory is unavailable right now. Please try again in a minute.", 503);
  }

  const items: { id: string; qty: number }[] = [];
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  let subtotalCents = 0;
  let ticketCount = 0;

  for (const [id, qty] of wanted) {
    const tier = getTier(id);
    if (!tier || !(tier.priceCents > 0)) return fail("Invalid ticket selection.", 400);
    if (qty > maxPerOrderOf(tier)) return fail(`You can buy up to ${maxPerOrderOf(tier)} of ${tier.name} per order.`, 400);

    const remaining = availability[tier.id].remaining;
    if (remaining !== null && remaining <= 0) return fail(`${tier.name} is sold out.`, 409);
    if (remaining !== null && qty > remaining) {
      return fail(`Only ${remaining} ${tier.name} ticket${remaining === 1 ? "" : "s"} left.`, 409);
    }

    items.push({ id: tier.id, qty });
    subtotalCents += tier.priceCents * qty;
    ticketCount += qty * admitsOf(tier);
    lineItems.push({
      quantity: qty,
      price_data: {
        currency: EVENT.currency,
        unit_amount: tier.priceCents,
        product_data: { name: `${tier.name} · ${EVENT.name}`, description: EVENT.dateLabel },
      },
    });
  }

  const feeCents = computeFeeCents(subtotalCents, ticketCount);
  if (feeCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: EVENT.currency,
        unit_amount: feeCents,
        product_data: { name: FEES.label },
      },
    });
  }

  // Stripe caps each metadata value at 500 characters, so names are kept short.
  const clip = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 40) : "");
  const buyerName = clip(body.name);
  const guestNames = Array.isArray(body.guestNames) ? body.guestNames.slice(0, MAX_PER_TIER - 1).map(clip) : [];
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;

  try {
    const stripe = new Stripe(secretKey, { maxNetworkRetries: 2 });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      allow_promotion_codes: true,
      success_url: `${SITE_URL}/skylounge-rooftop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/skylounge-rooftop?canceled=1`,
      customer_email: validEmail,
      metadata: {
        event: EVENT_KEY,
        items: JSON.stringify(items),
        buyerName,
        guestNames: JSON.stringify(guestNames),
        newsletterOptIn: body.newsletterOptIn === true ? "true" : "false",
      },
    });
    if (!session.url) return fail("Could not start checkout. Please try again.", 502);
    return NextResponse.json({ url: session.url });
  } catch {
    return fail("Could not start checkout. Please try again.", 502);
  }
}
