// ===========================================
// POST /api/line/webhook
// LINE Messaging API webhook entry
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/line/messaging";
import {
  handleFollow,
  handleMedia,
  handlePostback,
  handleText,
  type LineWebhookEvent,
} from "@/lib/line/handlers";

export const runtime = "nodejs";

interface LineWebhookBody {
  destination: string;
  events: LineWebhookEvent[];
}

export async function POST(req: NextRequest) {
  // 1) Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") || "";

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  try {
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn("[LINE webhook] invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } catch (err) {
    console.error("[LINE webhook] signature check error:", err);
    return NextResponse.json({ error: "Signature error" }, { status: 500 });
  }

  // 2) Parse body
  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3) LINE Console verifies the URL with empty events array — must return 200
  if (!body.events || body.events.length === 0) {
    return NextResponse.json({ ok: true });
  }

  // 4) Dispatch each event (concurrently, isolated failures)
  await Promise.allSettled(
    body.events.map((event) => dispatchEvent(event))
  );

  // 5) Always 200 — LINE retries on non-2xx
  return NextResponse.json({ ok: true });
}

async function dispatchEvent(event: LineWebhookEvent): Promise<void> {
  try {
    switch (event.type) {
      case "follow":
        await handleFollow(event);
        return;
      case "message": {
        const msgType = event.message?.type;
        if (msgType === "image" || msgType === "file") return await handleMedia(event);
        if (msgType === "text") return await handleText(event);
        return;
      }
      case "postback":
        await handlePostback(event);
        return;
      default:
        // unfollow / join / leave / etc. — ignore
        return;
    }
  } catch (err) {
    console.error("[LINE webhook] dispatch error:", event.type, err);
  }
}
