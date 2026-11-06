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
// Resets (LINE-25):
//   - drafts stuck in `saving` for > 10 minutes (function died mid-write) back to
//     `pending` so the user can press บันทึก again instead of waiting for expiry
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
import { SAVING_PREFIX, SAVING_STALE_CRON_MS, isSavingStale } from "@/lib/line/draft-status";

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

  // LINE-25: draft ที่ค้าง saving (ยังไม่หมดอายุ) เกิน 10 นาที → คืนเป็น pending ให้กดบันทึกใหม่ได้
  // เวลาที่ claim ฝังอยู่ใน status ("saving:<ms>") — แถวเก่าใช้ createdAt (ดู draft-status.ts)
  const savingRows = await prisma.lineDraft.findMany({
    where: { status: { startsWith: SAVING_PREFIX }, expiresAt: { gte: now } },
    select: { id: true, status: true, createdAt: true },
  });
  const stuckIds = savingRows
    .filter((r) => isSavingStale(r, SAVING_STALE_CRON_MS, now.getTime()))
    .map((r) => r.id);
  let resetCount = 0;
  if (stuckIds.length > 0) {
    const reset = await prisma.lineDraft.updateMany({
      where: { id: { in: stuckIds }, status: { startsWith: SAVING_PREFIX } },
      data: { status: "pending" },
    });
    resetCount = reset.count;
    console.warn(`[cron cleanup-line-drafts] reset ${resetCount} draft(s) stuck in saving → pending (LINE-25):`, stuckIds);
  }

  return NextResponse.json({
    success: true,
    deletedCount: result.count,
    resetStuckSavingCount: resetCount,
    ranAt: now,
  });
}
