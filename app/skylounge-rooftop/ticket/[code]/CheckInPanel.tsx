"use client";

import { useEffect, useState } from "react";

const PIN_STORAGE_KEY = "awp-door-pin"; // shared with the door list and stats pages
const DISPLAY_FONT = 'var(--font-display, "Playfair Display", Georgia, serif)';

// localStorage can throw (private mode, blocked site data), so every access is guarded.
function readSavedPin(): string {
  try {
    return window.localStorage.getItem(PIN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function clearSavedPin(): void {
  try {
    window.localStorage.removeItem(PIN_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

// Fixed to Atlanta time so the server render and the browser render agree
// (no hydration mismatch) no matter where the viewer's device or the host is.
function formatCheckInTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

// Green VALID / red USED card with a PIN-gated check-in button. The PIN is
// remembered on the device after the door list is unlocked once, so door staff
// only type it once all night. This card only ever receives a MASKED email.
export default function CheckInPanel({
  code,
  tierName,
  guestName,
  initialStatus,
  initialUsedAt,
  maskedEmail,
  eventDate,
}: {
  code: string;
  tierName: string;
  guestName: string | null;
  initialStatus: "valid" | "used";
  initialUsedAt: string | null;
  maskedEmail: string;
  eventDate: string;
}) {
  const [status, setStatus] = useState<"valid" | "used">(initialStatus);
  const [usedAt, setUsedAt] = useState<string | null>(initialUsedAt);
  // Staff-only: check-in controls render ONLY on devices that have already
  // unlocked the door list (/skylounge-rooftop/door) with the door PIN.
  // Customers viewing their own ticket see nothing but the ticket.
  const [isStaff, setIsStaff] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = readSavedPin();
    if (saved) {
      setPin(saved);
      setIsStaff(true);
    }
  }, []);

  const checkIn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/skylounge-rooftop/ticket/${encodeURIComponent(code)}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      let data: { error?: string; used_at?: string | null } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON error body */
      }

      if (res.status === 401) {
        // Stored PIN is stale (rotated). Hide controls; staff re-unlocks via the door list.
        clearSavedPin();
        setPin("");
        setIsStaff(false);
        setError("PIN not accepted. Open the door list and enter it again.");
        return;
      }
      if (res.status === 429) {
        setError("Too many attempts. Wait a minute, then try again.");
        return;
      }
      if (res.status === 503) {
        setError("Door tools are not configured yet.");
        return;
      }
      if (res.status === 409) {
        setStatus("used");
        setUsedAt(data.used_at ?? null);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      setStatus("used");
      setUsedAt(data.used_at ?? new Date().toISOString());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const usedTime = formatCheckInTime(usedAt);

  return (
    <div
      className={`rounded-3xl p-8 text-center border-2 ${
        status === "valid"
          ? "bg-emerald-500/10 border-emerald-400/70"
          : "bg-red-500/10 border-red-500/60"
      }`}
    >
      {status === "valid" ? (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-400 flex items-center justify-center text-[#0c0a08]">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 style={{ fontFamily: DISPLAY_FONT }} className="text-3xl font-black text-emerald-300 mb-1">
            TICKET VALID
          </h2>
          <p className="text-white/60 text-sm">Not checked in yet. Show this at the door.</p>
        </>
      ) : (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500 flex items-center justify-center text-white">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </div>
          <h2 style={{ fontFamily: DISPLAY_FONT }} className="text-3xl font-black text-red-300 mb-1">
            ALREADY USED
          </h2>
          {usedTime && <p className="text-red-200/80 text-sm mb-1">Checked in at {usedTime}</p>}
        </>
      )}

      {guestName && <p className="text-white font-black text-xl mt-3">{guestName}</p>}
      <p className={`text-[#f7dfa0] font-bold text-lg ${guestName ? "mt-0.5" : "mt-3"}`}>{tierName}</p>
      {eventDate && <p className="text-white/50 text-xs mt-1">{eventDate}</p>}
      <p className="text-white/70 font-mono text-sm tracking-[0.25em] mt-4">{code}</p>
      {maskedEmail && <p className="text-white/40 text-xs mt-1">{maskedEmail}</p>}

      {status === "valid" && isStaff && (
        <div className="mt-7">
          <button
            type="button"
            onClick={() => void checkIn()}
            disabled={busy}
            className="w-full bg-emerald-400 disabled:opacity-50 text-[#0c0a08] font-black py-4 rounded-xl text-base"
          >
            {busy ? "Checking in..." : "Check In (staff)"}
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 text-red-300 bg-red-500/10 border border-red-500/30 text-xs rounded-lg px-3 py-2"
        >
          {error}
        </p>
      )}
    </div>
  );
}
