import { NextResponse } from "next/server";
import Stripe from "stripe";
import { issueTicketsForSession } from "@/lib/skylounge-issue-tickets";

export const runtime = "nodejs";

// Stripe calls this after payment, even if the buyer closed the browser.
// Issuance is idempotent (the order's primary key is the session id), so this
// and the success page can both run safely.
export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const payload = await req.text();
  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const result = await issueTicketsForSession(session.id);
    // A real failure returns 500 so Stripe retries; "skipped" results are fine.
    if (result.error) {
      console.error("skylounge ticket issuance failed:", result.error);
      return NextResponse.json({ error: "Issuance failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
