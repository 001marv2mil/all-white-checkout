"use client";

import { useEffect, useState } from "react";

const PIN_STORAGE_KEY = "awp-door-pin"; // shared with the QR check-in and stats pages

interface TicketRow {
  code: string;
  tier: string;
  tierName: string;
  status: "valid" | "used";
  used_at: string | null;
  guestName: string | null;
}

interface Guest {
  name: string | null;
  email: string | null;
  phone: string | null;
  tickets: TicketRow[];
}

// localStorage can throw (private mode, blocked site data), so every access is guarded.
function readSavedPin(): string {
  try {
    return window.localStorage.getItem(PIN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function savePin(pin: string): void {
  try {
    window.localStorage.setItem(PIN_STORAGE_KEY, pin);
  } catch {
    /* storage unavailable: the PIN just won't be remembered */
  }
}

function clearSavedPin(): void {
  try {
    window.localStorage.removeItem(PIN_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

const PIN_REJECTED = "That PIN was not accepted. Enter the door PIN again.";
const RATE_LIMITED = "Too many attempts. Wait a minute, then try again.";
const NOT_CONFIGURED = "Door tools are not configured yet.";

export default function DoorList() {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [totals, setTotals] = useState({ totalTickets: 0, checkedIn: 0 });
  const [search, setSearch] = useState("");
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadList = async (pinToUse: string) => {
    setLoading(true);
    try {
      const res = await fetch("/skylounge-rooftop/door/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinToUse }),
      });
      let data: {
        error?: string;
        guests?: Guest[];
        totalTickets?: number;
        checkedIn?: number;
      } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON error body */
      }

      if (res.status === 401) {
        clearSavedPin();
        setUnlocked(false);
        setError(PIN_REJECTED);
        return;
      }
      if (res.status === 429) {
        setError(RATE_LIMITED);
        return;
      }
      if (res.status === 503) {
        setError(NOT_CONFIGURED);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Could not load the list.");
        return;
      }

      savePin(pinToUse);
      setGuests(Array.isArray(data.guests) ? data.guests : []);
      setTotals({
        totalTickets: Number(data.totalTickets) || 0,
        checkedIn: Number(data.checkedIn) || 0,
      });
      setUnlocked(true);
      setError(null);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const saved = readSavedPin();
    if (saved) {
      setPin(saved);
      void loadList(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh every 20s so check-ins made on other phones (or via QR scan)
  // show up without tapping the refresh button.
  useEffect(() => {
    if (!unlocked) return;
    const t = setInterval(() => {
      const saved = readSavedPin();
      if (saved) void loadList(saved);
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  const checkIn = async (code: string) => {
    setBusyCode(code);
    setError(null);
    try {
      const res = await fetch(`/skylounge-rooftop/ticket/${encodeURIComponent(code)}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (res.ok || res.status === 409) {
        let usedAt: string | null = null;
        try {
          const data = await res.json();
          usedAt = typeof data?.used_at === "string" ? data.used_at : null;
        } catch {
          /* body not needed */
        }
        setGuests((gs) =>
          gs.map((g) => ({
            ...g,
            tickets: g.tickets.map((t) =>
              t.code === code
                ? { ...t, status: "used" as const, used_at: usedAt ?? t.used_at }
                : t
            ),
          }))
        );
        setTotals((t) => ({ ...t, checkedIn: t.checkedIn + (res.ok ? 1 : 0) }));
        return;
      }

      if (res.status === 401) {
        // Stored PIN went stale (rotated). Back to the PIN screen.
        clearSavedPin();
        setUnlocked(false);
        setError(PIN_REJECTED);
        return;
      }
      if (res.status === 429) {
        setError(RATE_LIMITED);
        return;
      }
      if (res.status === 503) {
        setError(NOT_CONFIGURED);
        return;
      }
      let message = "Could not check that ticket in.";
      try {
        const data = await res.json();
        if (typeof data?.error === "string" && data.error) message = data.error;
      } catch {
        /* keep the generic message */
      }
      setError(message);
    } catch {
      setError("Network error. The ticket was not checked in. Try again.");
    } finally {
      setBusyCode(null);
    }
  };

  if (!unlocked) {
    return (
      <div className="bg-white/[0.04] border border-[#e0b256]/40 rounded-2xl p-6 text-center">
        <p className="text-white/70 text-sm mb-4">Enter the door PIN to open the guest list.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading && pin.length > 0) void loadList(pin);
          }}
        >
          <input
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Door PIN"
            placeholder="Door PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-3 text-center text-lg tracking-[0.3em] text-white placeholder:text-white/30 placeholder:tracking-normal mb-3"
          />
          <button
            type="submit"
            disabled={loading || pin.length === 0}
            className="w-full disabled:opacity-40 text-[#1a1208] font-black py-3.5 rounded-xl"
            style={{ backgroundImage: "linear-gradient(to right, #f7dfa0, #b5822c)" }}
          >
            {loading ? "Opening..." : "Open Guest List"}
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-red-300 text-xs">
            {error}
          </p>
        )}
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? guests.filter(
        (g) =>
          (g.name ?? "").toLowerCase().includes(q) ||
          (g.email ?? "").toLowerCase().includes(q) ||
          g.tickets.some(
            (t) =>
              t.code.toLowerCase().includes(q) || (t.guestName ?? "").toLowerCase().includes(q)
          )
      )
    : guests;

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <div className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-center">
          <p className="text-2xl font-black text-[#f7dfa0]">{totals.checkedIn}</p>
          <p className="text-white/50 text-[11px] uppercase tracking-wider">Checked in</p>
        </div>
        <div className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-center">
          <p className="text-2xl font-black text-white">{totals.totalTickets}</p>
          <p className="text-white/50 text-[11px] uppercase tracking-wider">Tickets sold</p>
        </div>
        <button
          type="button"
          onClick={() => void loadList(pin)}
          disabled={loading}
          aria-label="Refresh the guest list"
          className="bg-white/[0.06] border border-white/15 rounded-xl px-4 text-white/70 text-sm font-semibold"
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 text-red-300 bg-red-500/10 border border-red-500/30 text-xs rounded-lg px-3 py-2"
        >
          {error}
        </p>
      )}

      <input
        type="search"
        aria-label="Search guests"
        placeholder="Search name, email, or code..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/30 mb-4"
      />

      {filtered.length === 0 && (
        <p className="text-center text-white/40 text-sm py-8">
          {guests.length === 0 ? "No tickets sold yet." : "No matches."}
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((g, i) => (
          <div
            key={g.tickets[0]?.code ?? i}
            className="bg-white/[0.04] border border-white/10 rounded-2xl p-4"
          >
            <p className="font-bold text-white">{g.name || g.email?.split("@")[0] || "No name"}</p>
            <p className="text-white/45 text-xs mb-3">{g.email}</p>
            <div className="space-y-2">
              {g.tickets.map((t) => (
                <div
                  key={t.code}
                  className="flex items-center justify-between gap-3 bg-black/25 rounded-xl px-3 py-2.5"
                >
                  <div className="min-w-0">
                    {t.guestName && <p className="text-white text-sm font-bold">{t.guestName}</p>}
                    <p className="text-[#f7dfa0] text-sm font-semibold">{t.tierName}</p>
                    <p className="text-white/40 font-mono text-[11px] tracking-[0.15em]">{t.code}</p>
                  </div>
                  {t.status === "used" ? (
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-red-300 border border-red-400/40 bg-red-500/10 rounded-lg px-3 py-1.5">
                      Used
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void checkIn(t.code)}
                      disabled={busyCode === t.code}
                      className="shrink-0 bg-emerald-400 disabled:opacity-50 text-[#0c0a08] text-xs font-black px-4 py-2 rounded-lg"
                    >
                      {busyCode === t.code ? "..." : "Check In"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
