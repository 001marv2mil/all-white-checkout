import type { Metadata } from "next";
import { EVENT } from "@/lib/skylounge-rooftop";
import DoorList from "./DoorList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Door list | Atlanta Pulse",
  robots: { index: false, follow: false },
};

const DISPLAY_FONT = 'var(--font-display, "Playfair Display", Georgia, serif)';
const PAGE_BG = "radial-gradient(120% 80% at 50% 0%, #2a2016 0%, #140f0a 55%, #0c0a08 100%)";

// Door staff guest list: backup to QR scanning. The list itself is PIN-gated
// (the page below is only a shell; the data comes from POST /door/list).
export default function DoorPage() {
  const eventName = EVENT.name.trim();

  return (
    <div className="min-h-screen text-white px-4 py-8" style={{ background: PAGE_BG }}>
      <div className="max-w-lg mx-auto">
        <p
          style={{ fontFamily: DISPLAY_FONT }}
          className="text-center text-[#e0b256] text-xs font-bold tracking-[0.3em] uppercase mb-1"
        >
          Atlanta Pulse &middot; Door List
        </p>
        {eventName && (
          <h1 style={{ fontFamily: DISPLAY_FONT }} className="text-center text-2xl font-black mb-6">
            {eventName}
          </h1>
        )}
        {!eventName && <div className="mb-6" />}
        <DoorList />
      </div>
    </div>
  );
}
