// ===========================================
// Security Middleware
// Adds security headers + basic rate limiting
// Runs on every request (Edge runtime)
// ===========================================

import { NextRequest, NextResponse } from "next/server";

// In-memory rate limit store (reset on deploy — for production use Redis/Upstash)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  "/api/ocr/receipt": { max: 20, windowMs: 60 * 1000 }, // 20/min
  "/api/payments/upload": { max: 30, windowMs: 60 * 1000 }, // 30/min
  "/api/auth/line": { max: 10, windowMs: 60 * 1000 }, // 10/min login attempts
  "/api/auth/google": { max: 10, windowMs: 60 * 1000 },
  "/api/line/webhook": { max: 300, windowMs: 60 * 1000 }, // LINE may burst
};

function getClientId(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";
  return ip;
}

function applyRateLimit(req: NextRequest): { ok: boolean; retryAfter?: number } {
  const path = req.nextUrl.pathname;
  const limit = RATE_LIMITS[path];
  if (!limit) return { ok: true };

  const clientId = getClientId(req);
  const key = `${path}:${clientId}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { ok: true };
  }

  if (entry.count >= limit.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { ok: false, retryAfter };
  }

  entry.count++;
  return { ok: true };
}

// Clean up expired rate limit entries (every 100 requests)
let cleanupCounter = 0;
function maybeCleanup() {
  if (++cleanupCounter < 100) return;
  cleanupCounter = 0;
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}

export function middleware(req: NextRequest) {
  maybeCleanup();

  // Rate limiting
  const rl = applyRateLimit(req);
  if (!rl.ok) {
    return new NextResponse(
      JSON.stringify({ error: "Too many requests — please try again later" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfter || 60),
        },
      }
    );
  }

  const response = NextResponse.next();

  // ===== Affiliate code capture (S26) =====
  // Drop `aim_ref` cookie when ?ref=CODE is present in URL.
  // Cookie persists 30 days → applied at sign-up to credit the partner.
  const refParam = req.nextUrl.searchParams.get("ref");
  if (refParam && /^[A-Za-z0-9-]{4,16}$/.test(refParam)) {
    response.cookies.set("aim_ref", refParam, {
      httpOnly: false, // readable by client for /pricing prefill
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });
  }

  // ===== Security Headers =====
  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  // Prevent MIME sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");
  // Referrer policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions policy (restrict browser features)
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), payment=()"
  );

  // HSTS — enforce HTTPS in production (1 year)
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  // Content Security Policy — allow required third-parties
  const csp = [
    "default-src 'self'",
    // scripts: self + Next.js inline (dev) + nothing else
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // styles: self + inline (for CSS-in-JS) + Google Fonts
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    // images: self + data (base64) + Google avatars + LINE profile + QR service
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://profile.line-scdn.net https://api.qrserver.com https://drive.google.com",
    // XHR/fetch: self + LINE + Google + OpenAI + AksonOCR
    "connect-src 'self' https://access.line.me https://api.line.me https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://api.openai.com https://api.aksonocr.com",
    // frames (PDF preview, Drive docs)
    "frame-src 'self' blob: https://drive.google.com https://docs.google.com",
    // objects (PDF preview fallback)
    "object-src 'self' blob:",
    // base URI
    "base-uri 'self'",
    // form action (only self + OAuth providers)
    "form-action 'self' https://access.line.me https://accounts.google.com",
    // frame ancestors (same as X-Frame-Options)
    "frame-ancestors 'self'",
    // upgrade insecure requests in production
    process.env.NODE_ENV === "production" ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  // Run on all paths except static assets + Next internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|css|js|map)).*)",
  ],
};
