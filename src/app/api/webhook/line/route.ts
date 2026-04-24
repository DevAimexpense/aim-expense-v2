// ===========================================
// POST /api/webhook/line
// Receive LINE OA webhook events
// Events: follow, unfollow, message (text/image/file), postback, ...
//
// For local dev: use ngrok to expose localhost, set webhook URL in LINE Console
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/line/messaging";
import { prisma } from "@/lib/prisma";

interface LineWebhookEvent {
  type: string;
  timestamp: number;
  source?: {
    type: string;
    userId?: string;
  };
  replyToken?: string;
  message?: {
    id: string;
    type: string;
    text?: string;
  };
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-line-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  // Verify signature
  let isValid = false;
  try {
    isValid = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    console.error("[LINE webhook] signature check failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { events: LineWebhookEvent[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Process events asynchronously — respond 200 to LINE quickly
  for (const event of payload.events || []) {
    try {
      await handleEvent(event);
    } catch (err) {
      console.error("[LINE webhook] event error:", err, event);
    }
  }

  return NextResponse.json({ success: true });
}

async function handleEvent(event: LineWebhookEvent): Promise<void> {
  const userId = event.source?.userId;
  if (!userId) return;

  switch (event.type) {
    case "follow": {
      // User added LINE OA as friend
      const user = await prisma.user.findUnique({
        where: { lineUserId: userId },
      });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lineFollowedOAAt: new Date(),
            lineConnection: {
              update: {
                isFollowingOA: true,
                oaLinkedAt: new Date(),
              },
            },
          },
        });
      }
      console.log("[LINE webhook] follow:", userId);
      break;
    }

    case "unfollow": {
      const user = await prisma.user.findUnique({
        where: { lineUserId: userId },
      });
      if (user) {
        await prisma.lineConnection.update({
          where: { userId: user.id },
          data: { isFollowingOA: false },
        });
      }
      console.log("[LINE webhook] unfollow:", userId);
      break;
    }

    case "message": {
      // TODO: handle receipt images (save to Drive) — Phase: LINE receipts
      console.log(
        "[LINE webhook] message type:",
        event.message?.type,
        "from:",
        userId
      );
      break;
    }

    default:
      console.log("[LINE webhook] unhandled event type:", event.type);
  }
}
