"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  EVENT,
  TIERS,
  FEES,
  FAQ,
  MAX_PER_TIER,
  VIP_SECTION,
  computeFeeCents,
  tierRemaining,
  type Tier,
  type TierId,
} from "@/lib/skylounge-rooftop";

const VIDEO_ID = "muPO1c6pxXg";
const VIDEO_START_SECONDS = 44;

const money = (cents: number) => "$" + (cents / 100).toFixed(2);
const shortPrice = (cents: number) => "$" + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);

interface Player {
  playVideo?: () => void;
  stopVideo?: () => void;
}

type YouTubeWindow = Window & {
  YT?: { Player: new (id: string, options: object) => Player };
  onYouTubeIframeAPIReady?: () => void;
};

function Arrow({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** The "A" with a heartbeat line through it. */
function Mark({ height }: { height: number }) {
  return (
    <svg width={height * 1.2} height={height} viewBox="0 0 96 80" fill="none" aria-hidden="true">
      <path d="M18 76 L48 8 L78 76" stroke="#fff" strokeWidth="9" strokeLinejoin="miter" />
      <path d="M4 54 H36 L45 30 L55 68 L62 54 H92" stroke="#fb6904" strokeWidth="7" strokeLinejoin="miter" />
    </svg>
  );
}

export default function SkyloungeRooftopPage() {
  return (
    <Suspense fallback={<div className="atl" />}>
      <Checkout />
    </Suspense>
  );
}

function Checkout() {
  const canceled = useSearchParams().get("canceled") === "1";

  const [live, setLive] = useState<Partial<Record<TierId, number>> | null>(null);
  const [tierId, setTierId] = useState<TierId>("ga");
  const [qty, setQty] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState<string[]>([]);
  const [optIn, setOptIn] = useState(true);
  const [payMethod, setPayMethod] = useState("card");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const player = useRef<Player | null>(null);
  const detailsRef = useRef<HTMLElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/skylounge-rooftop/availability", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.tiers) return;
        const next: Partial<Record<TierId, number>> = {};
        for (const tier of TIERS) {
          const remaining = data.tiers[tier.id]?.remaining;
          if (typeof remaining === "number") next[tier.id] = remaining;
        }
        setLive(next);
      })
      .catch(() => {
        /* the server re-checks stock at checkout */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const w = window as YouTubeWindow;
    const create = () => {
      if (player.current || !w.YT) return;
      player.current = new w.YT.Player("yt-audio-player", {
        videoId: VIDEO_ID,
        playerVars: { start: VIDEO_START_SECONDS, autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
      });
    };
    if (w.YT) create();
    else {
      w.onYouTubeIframeAPIReady = create;
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const el = detailsRef.current;
      if (el) setSticky(el.getBoundingClientRect().bottom < 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const remainingFor = (tier: Tier) => live?.[tier.id] ?? tierRemaining(tier);
  const openTiers = TIERS.filter((t) => !t.soldOut && remainingFor(t) > 0);
  const totalLeft = openTiers.reduce((sum, t) => sum + remainingFor(t), 0);
  const fromLabel = openTiers.length ? shortPrice(Math.min(...openTiers.map((t) => t.priceCents))) : null;

  // Fall back to the first open tier if the selected one has sold out.
  const selected = openTiers.find((t) => t.id === tierId) ?? openTiers[0] ?? null;
  const maxQty = selected ? Math.min(MAX_PER_TIER, remainingFor(selected)) : 1;
  const count = Math.max(1, Math.min(qty, maxQty));
  const subtotal = selected ? selected.priceCents * count : 0;
  const fee = selected ? computeFeeCents(subtotal, count) : 0;

  const toggleMusic = () => {
    const next = !playing;
    setPlaying(next);
    if (next) player.current?.playVideo?.();
    else player.current?.stopVideo?.();
  };

  const pay = async () => {
    if (!selected) return;
    if (!name.trim()) return nameRef.current?.focus();
    if (!emailRef.current?.checkValidity() || !email.trim()) return emailRef.current?.focus();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/skylounge-rooftop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: selected.id, qty: count }],
          email: email.trim(),
          name: name.trim(),
          guestNames: Array.from({ length: count - 1 }, (_, i) => (guests[i] ?? "").trim()),
          newsletterOptIn: optIn,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Please try again.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
      setLoading(false);
    }
  };

  const getTickets = (
    <button className="btn-gold" type="button" onClick={() => setSheetOpen(true)} disabled={!fromLabel}>
      <span>{fromLabel ? "Get Tickets" : "Sold Out"}</span>
      <Arrow size={18} />
    </button>
  );

  const scarcity = fromLabel ? `🔥 Only ${totalLeft} tickets left in total` : "Sold out";

  return (
    <div className="atl">
      <div className="grain" />

      <button className={`sticky-cta${sticky ? " show" : ""}`} type="button" onClick={() => setSheetOpen(true)}>
        <span>Get Tickets</span>
        {fromLabel && (
          <>
            <span className="dot">·</span>
            <span>From {fromLabel}</span>
          </>
        )}
      </button>

      <main>
        <header className="site-header">
          <div className="brand">
            <div className="brand-logo-atl" role="img" aria-label="Atlanta Pulse">
              <Mark height={58} />
              <span className="wordmark" aria-hidden="true">
                ΛTLΛNTΛ <b>PULSE</b>
              </span>
            </div>
          </div>
          <div className="brand-underline" aria-hidden="true" />
          <p className="tagline">
            GOOD PEOPLE <span className="sep">•</span> GOOD VIBES <span className="sep">•</span> GOOD TIMES
          </p>
        </header>

        <section className="hero">
          <h1 className="hero-title">
            <span className="line1">ALL WHITE</span>
            <span className="line2">R&amp;B</span>
            <span className="line3">
              <em>ROOFTOP</em>
            </span>
          </h1>

          <p className="badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.2 21 12 17.56 5.8 21 7 14.14 2 9.27l7.1-1.01L12 2z" />
            </svg>
            ATLANTA&apos;S PREMIER R&amp;B EXPERIENCE
          </p>

          <p className="dj-line">
            Music by <span className="gold">{EVENT.headliner || "Atlanta’s Top R&B DJ"}</span>
          </p>
          <p className="dj-sub">
            CLASSICS <span className="sep">•</span> SLOW JAMS <span className="sep">•</span> NEW FLAVOR
          </p>

          <button className={`play-pill${playing ? " playing" : ""}`} type="button" aria-pressed={playing} onClick={toggleMusic}>
            <span className="play-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span>{playing ? "Now playing…" : "Press play to set the mood"}</span>
            <span className="eq" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </button>
          <div className="yt-holder" aria-hidden="true">
            <div id="yt-audio-player" />
          </div>
        </section>

        {canceled && <p className="notice">Checkout canceled. No charge was made.</p>}

        <section className="details" ref={detailsRef}>
          <div className="info-card">
            <p className="info-label">DATE</p>
            <p className="info-value">{EVENT.dateLabel}</p>
          </div>
          <div className="info-card">
            <p className="info-label">TIME</p>
            <p className="info-value">{EVENT.timeLabel}</p>
          </div>
          <div className="info-card">
            <p className="info-label">WHERE</p>
            <p className="info-value">{EVENT.venue}</p>
            <p className="info-sub">{EVENT.address}</p>
          </div>
          <div className="info-card">
            <p className="info-label">ATTIRE</p>
            <p className="info-value">{EVENT.dressCode}</p>
            <p className="info-sub">Layer up — it&apos;s December in Atlanta</p>
          </div>
        </section>

        <section className="cta-main">
          {getTickets}
          <p className="cta-caption">
            {fromLabel ? `Starting at ${fromLabel}` : "Sold out"} <span className="dot">·</span> Instant e-tickets{" "}
            <span className="dot">·</span> Apple / Google Pay
          </p>
          <p className="cta-caption scarcity">{scarcity}</p>
        </section>

        <hr className="divider" />

        {VIP_SECTION.enabled && (
          <>
            <section className="vip-section">
              <p className="eyebrow">FOR YOUR CREW</p>
              <h2 className="vip-title">Reserve a VIP Section</h2>
              <div className="vip-card">
                <p className="vip-desc">{VIP_SECTION.description}</p>
                <p className="vip-scarcity">{VIP_SECTION.scarcity}</p>
                <div className="vip-contacts">
                  {VIP_SECTION.contacts.map((c) => (
                    <a key={c.phone} className="contact-btn" href={`sms:${c.phone}`}>
                      {c.label}
                    </a>
                  ))}
                </div>
              </div>
            </section>
            <hr className="divider" />
          </>
        )}

        <section className="location">
          <p className="eyebrow">LOCATION</p>
          <h2 className="loc-title">{EVENT.venue}</h2>
          <p className="loc-address">{EVENT.address}</p>
          <a className="maps-link" href={EVENT.mapsUrl} target="_blank" rel="noopener noreferrer">
            Open in Google Maps
            <Arrow size={15} />
          </a>
          <div className="map-preview">
            <iframe
              className="map-frame"
              src="/skylounge-map.html"
              title={`Map showing ${EVENT.venue} at ${EVENT.address}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </section>

        <hr className="divider" />

        <section className="faq">
          <p className="eyebrow">GOOD TO KNOW</p>
          <h2 className="faq-title">Questions, answered</h2>
          <div className="accordion">
            {FAQ.map((item, i) => (
              <div key={item.q} className={`acc-item${openFaq === i ? " open" : ""}`}>
                <button className="acc-trigger" type="button" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{item.q}</span>
                  <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <div className="acc-panel">
                  <p>{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="cta-final">{getTickets}</section>

        <footer className="site-footer">
          <span className="back-link">
            <Mark height={18} />
            An event by Atlanta Pulse
          </span>
        </footer>
      </main>

      <div
        className={`checkout-overlay${sheetOpen ? " open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSheetOpen(false);
        }}
      >
        <div className="checkout-sheet" role="dialog" aria-modal="true" aria-label="Get your tickets" inert={!sheetOpen}>
          <div className="sheet-handle" />
          <div className="sheet-header">
            <div className="sheet-heading">
              <Mark height={16} />
              <p className="sheet-eyebrow">ATLANTA PULSE · ALL WHITE R&amp;B ROOFTOP</p>
            </div>
            <button className="sheet-close" type="button" aria-label="Close checkout" onClick={() => setSheetOpen(false)}>
              ✕
            </button>
          </div>
          <h3 className="sheet-title">Get your tickets</h3>
          <p className="cta-caption scarcity">{scarcity}</p>

          <div className="sheet-body">
            <div className="tier-list">
              {TIERS.map((tier) => {
                const soldOut = !openTiers.includes(tier);
                const checked = selected?.id === tier.id;
                return (
                  <label key={tier.id} className={`tier-option${soldOut ? " soldout" : ""}${checked ? " selected" : ""}`}>
                    <input type="radio" name="tier" value={tier.id} checked={checked} disabled={soldOut} onChange={() => setTierId(tier.id)} />
                    <span className="tier-radio" />
                    <span className="tier-text">
                      <span className="tier-name">{tier.name}</span>
                      <span className="tier-tag">{soldOut ? "Sold out" : tier.tag}</span>
                    </span>
                    <span className="tier-price">{shortPrice(tier.priceCents)}</span>
                  </label>
                );
              })}
            </div>

            <div className="qty-row">
              <span className="qty-label">Quantity</span>
              <div className="stepper">
                <button className="step-btn" type="button" aria-label="Decrease quantity" disabled={count <= 1} onClick={() => setQty(count - 1)}>
                  −
                </button>
                <span className="qty-value">{count}</span>
                <button className="step-btn" type="button" aria-label="Increase quantity" disabled={count >= maxQty} onClick={() => setQty(count + 1)}>
                  +
                </button>
              </div>
            </div>

            <div className="summary">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="summary-row">
                <span>{FEES.label}</span>
                <span>{money(fee)}</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span>{money(subtotal + fee)}</span>
              </div>
            </div>

            {VIP_SECTION.enabled && (
              <div className="vip-note">
                <p>
                  Hosting a crew of 8–12? Reserve a <strong>VIP Section</strong> for <strong>{VIP_SECTION.price} flat</strong> (bar tab included) — booked directly by text, not through this checkout.
                </p>
                <div className="vip-contacts compact">
                  {VIP_SECTION.contacts.map((c) => (
                    <a key={c.phone} className="contact-btn small" href={`sms:${c.phone}`}>
                      {c.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <label className="field">
              <span>Your name</span>
              <input ref={nameRef} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="First & last name" autoComplete="name" maxLength={40} />
            </label>
            {Array.from({ length: count - 1 }, (_, i) => (
              <label key={i} className="field">
                <span>Guest {i + 2} name (optional)</span>
                <input
                  type="text"
                  value={guests[i] ?? ""}
                  maxLength={40}
                  autoComplete="off"
                  placeholder={`Friend's name for ticket ${i + 2}`}
                  onChange={(e) => {
                    const next = [...guests];
                    next[i] = e.target.value;
                    setGuests(next);
                  }}
                />
              </label>
            ))}
            <label className="field">
              <span>Email for e-tickets</span>
              <input ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" inputMode="email" />
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
              <span>Keep me posted about future Atlanta Pulse events</span>
            </label>

            <div className="pay-options">
              {[
                { id: "apple", label: " Pay" },
                { id: "google", label: "G Pay" },
                { id: "card", label: "Card" },
              ].map((m) => (
                <button key={m.id} type="button" className={`pay-btn ${m.id}${payMethod === m.id ? " selected" : ""}`} onClick={() => setPayMethod(m.id)}>
                  {m.id === "apple" ? "Apple Pay" : m.id === "google" ? "Google Pay" : m.label}
                </button>
              ))}
            </div>

            {error && <p className="form-error">{error}</p>}

            <button className="checkout-submit" type="button" disabled={!selected || loading} onClick={() => void pay()}>
              {loading ? "Redirecting to secure checkout…" : selected ? `Pay ${money(subtotal + fee)}` : "Sold out"}
            </button>
            <p className="secure-note">Secure checkout · Instant e-tickets · No hidden fees</p>
          </div>
        </div>
      </div>
    </div>
  );
}
