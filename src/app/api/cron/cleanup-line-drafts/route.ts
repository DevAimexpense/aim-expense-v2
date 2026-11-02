// ===========================================
// GET /api/cron/cleanup-line-drafts
// Daily sweep — delete LineDraft rows that are no longer needed (LINE-06).
// Drafts hold ocrJson (vendor, tax id, totals) and must only live until the
// user confirms/cancels (Zero Data Retention — SYSTEM_REQUIREMENTS.md).
//
// Deletes:
//   - any draft past `expiresAt`
//   - drafts in a terminal status (confirmed / cancelled / expired) older than 1 day
//     (normal flow already deletes on confirm/cancel; this catches stragglers)
//
// Schedule via Vercel Cron in vercel.json:
//   { "path": "/api/cron/cleanup-line-drafts", "schedule": "0 20 * * *" }
// (runs at 20:00 UTC = 03:00 Bangkok)
//
// Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Unlike the older
// cron routes this one FAILS CLOSED when CRON_SECRET is unset — a destructive
// route must never be callable unauthenticated.
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TERMINAL_STATUSES = ["confirmed", "cancelled", "expired"];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const result = await prisma.lineDraft.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { status: { in: TERMINAL_STATUSES }, createdAt: { lt: oneDayAgo } },
      ],
    },
  });

  return NextResponse.json({
    success: true,
    deletedCount: result.count,
    ranAt: now,
  });
}
