import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkDoorPin } from "@/lib/door-auth";

export const runtime = "nodejs";

// PIN-gated check-in. The update only matches a still-valid ticket, so two
// phones scanning the same ticket at once can never both succeed.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cleanCode = String(code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20);

  let body: { pin?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* PIN check below rejects an empty body */
  }

  const auth = checkDoorPin(req, body.pin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!cleanCode) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("awp_tickets")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("code", cleanCode)
      .eq("status", "valid")
      .select("used_at");
    if (error) return NextResponse.json({ error: "Could not check in." }, { status: 500 });

    if (data && data.length > 0) {
      return NextResponse.json({ ok: true, used_at: data[0].used_at });
    }

    const existing = await db
      .from("awp_tickets")
      .select("status, used_at")
      .eq("code", cleanCode)
      .maybeSingle();
    if (existing.error) return NextResponse.json({ error: "Could not check in." }, { status: 500 });
    if (!existing.data) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    return NextResponse.json(
      { error: "Already used.", used_at: existing.data.used_at },
      { status: 409 }
    );
  } catch {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }
}
