// Shared PIN gate for the door tools: check-in, guest list, print list and the
// sales dashboard. Server-only.
//
// - AWP_DOOR_PIN must be at least MIN_PIN_LENGTH characters. A shorter (or
//   missing) configured PIN is treated as "not configured" and everything
//   returns 503, so a weak PIN can never be live by accident.
// - The comparison is constant-time (both sides hashed to equal-length buffers,
//   then crypto.timingSafeEqual).
// - Failed attempts are throttled per client IP: MAX_FAILURES wrong guesses
//   inside WINDOW_MS locks that IP out (429) for LOCKOUT_MS. The counters live
//   in memory, so on serverless hosting they are per instance and reset on a
//   cold start. That is best-effort; the minimum PIN length is the real defense.
// - The PIN is never logged.
import { createHash, timingSafeEqual } from "node:crypto";

export type DoorAuthResult = { ok: true } | { ok: false; status: number; error: string };

const MIN_PIN_LENGTH = 6;
const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;
const LOCKOUT_MS = 60_000;
const MAX_TRACKED_IPS = 2_000;

interface Attempt {
  failures: number;
  windowStart: number;
  blockedUntil: number;
}

const attempts = new Map<string, Attempt>();

function clientIp(req: Request): string {
  const direct =
    req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";
  if (direct.trim()) return direct.split(",")[0].trim();
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0].trim();
  return first || "unknown";
}

function prune(now: number): void {
  if (attempts.size < MAX_TRACKED_IPS) return;
  for (const [ip, a] of attempts) {
    if (a.blockedUntil <= now && a.windowStart + WINDOW_MS <= now) attempts.delete(ip);
  }
  // Still full of live entries: drop the oldest so memory stays bounded.
  while (attempts.size >= MAX_TRACKED_IPS) {
    const oldest = attempts.keys().next();
    if (oldest.done) break;
    attempts.delete(oldest.value);
  }
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function pinMatches(supplied: string, configured: string): boolean {
  // Equal-length (32 byte) digests, so timingSafeEqual never throws and the
  // comparison time does not depend on how much of the PIN was right.
  return timingSafeEqual(digest(supplied), digest(configured));
}

export function checkDoorPin(req: Request, pin: unknown): DoorAuthResult {
  const configured = (process.env.AWP_DOOR_PIN ?? "").trim();
  if (configured.length < MIN_PIN_LENGTH) {
    return { ok: false, status: 503, error: "Door tools are not configured yet." };
  }

  const now = Date.now();
  const ip = clientIp(req);

  let record = attempts.get(ip);
  if (record && record.blockedUntil > now) {
    return { ok: false, status: 429, error: "Too many attempts. Try again in a minute." };
  }
  if (record && record.windowStart + WINDOW_MS <= now) {
    // Previous window (and any lockout) has expired: start fresh.
    attempts.delete(ip);
    record = undefined;
  }

  const supplied = typeof pin === "string" ? pin.trim() : "";
  if (supplied.length > 0 && pinMatches(supplied, configured)) {
    attempts.delete(ip);
    return { ok: true };
  }

  prune(now);
  const next: Attempt = record ?? { failures: 0, windowStart: now, blockedUntil: 0 };
  next.failures += 1;
  if (next.failures >= MAX_FAILURES) next.blockedUntil = now + LOCKOUT_MS;
  attempts.set(ip, next);

  return { ok: false, status: 401, error: "Wrong PIN." };
}
