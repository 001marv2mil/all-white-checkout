"use client";

import { useEffect } from "react";

/** "Atlanta Pulse Pixel" dataset in Meta Events Manager. Public by design. */
const PIXEL_ID = "1806497368150567";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: unknown;
  loaded: boolean;
  version: string;
};

type PixelWindow = Window & { fbq?: Fbq; _fbq?: Fbq };

/** Meta's standard loader, run once. Returns nothing on localhost so previews never pollute the data. */
function pixel(): Fbq | null {
  if (typeof window === "undefined") return null;
  if (!window.location.hostname.endsWith("myatlantapulse.com")) return null;
  const w = window as PixelWindow;
  if (w.fbq) return w.fbq;

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.queue = [];
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  w.fbq = fbq;
  w._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  // Only send the events written here: no automatic scraping of buttons or form fields.
  fbq("set", "autoConfig", false, PIXEL_ID);
  fbq("init", PIXEL_ID);
  fbq("track", "PageView");
  return fbq;
}

export function track(event: "ViewContent" | "InitiateCheckout", data?: Record<string, unknown>) {
  pixel()?.("track", event, data ?? {});
}

/** Event page: records the visit. */
export function PixelPageView() {
  useEffect(() => {
    track("ViewContent", { content_name: "All White R&B Rooftop" });
  }, []);
  return null;
}

/** Confirmation page: records a paid order once, even if the page is reloaded. */
export function PixelPurchase({ orderId, value }: { orderId: string; value: number }) {
  useEffect(() => {
    const key = `ap-purchase-${orderId}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      /* storage blocked: Meta still de-duplicates on eventID */
    }
    const fbq = pixel();
    if (!fbq) return;
    fbq("track", "Purchase", { value, currency: "USD" }, { eventID: orderId });
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [orderId, value]);
  return null;
}
