import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkDoorPin } from "@/lib/door-auth";
import { getTier } from "@/lib/skylounge-rooftop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OrderRow {
  session_id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
}

interface TicketRow {
  code: string;
  tier: string;
  status: "valid" | "used";
  used_at: string | null;
  guest_name: string | null;
  session_id: string;
}

// PIN-gated guest list for the door. Orders and tickets are tiny (capacity is
// under 150), so one query each is enough.
export async function POST(req: Request) {
  let body: { pin?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* PIN check below rejects an empty body */
  }

  const auth = checkDoorPin(req, body.pin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getSupabaseAdmin();
    const [orders, tickets] = await Promise.all([
      db.from("awp_orders").select("session_id, email, name, phone").limit(5000),
      db
        .from("awp_tickets")
        .select("code, tier, status, used_at, guest_name, session_id")
        .order("created_at", { ascending: true })
        .limit(5000),
    ]);
    if (orders.error || tickets.error) {
      return NextResponse.json({ error: "Could not load the guest list." }, { status: 500 });
    }

    const bySession = new Map<string, TicketRow[]>();
    for (const t of (tickets.data ?? []) as TicketRow[]) {
      const list = bySession.get(t.session_id) ?? [];
      list.push(t);
      bySession.set(t.session_id, list);
    }

    const guests = ((orders.data ?? []) as OrderRow[])
      .filter((o) => bySession.has(o.session_id))
      .map((o) => ({
        name: o.name,
        email: o.email,
        phone: o.phone,
        tickets: (bySession.get(o.session_id) ?? []).map((t) => ({
          code: t.code,
          tier: t.tier,
          tierName: getTier(t.tier)?.name ?? "Ticket",
          status: t.status,
          used_at: t.used_at,
          guestName: t.guest_name,
        })),
      }))
      .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));

    const all = (tickets.data ?? []) as TicketRow[];
    return NextResponse.json(
      {
        guests,
        totalTickets: all.length,
        checkedIn: all.filter((t) => t.status === "used").length,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }
}
