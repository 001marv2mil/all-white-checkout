import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/skylounge-ticketing";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const availability = await getAvailability();
    return NextResponse.json({ tiers: availability }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Availability unavailable." }, { status: 503 });
  }
}
