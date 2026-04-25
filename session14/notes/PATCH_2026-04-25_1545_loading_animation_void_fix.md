# Patch Note — Loading Animation + Async Bug Fix

> **Created:** 2026-04-25 15:45 ICT
> **Commit:** `cf5f6dc` fix(line): await text-expense flow + show typing-dots animation
> **Files:** 2 modified — +63 / -10

---

## 🐛 Two Issues Fixed

### Bug 1 — Carousel ไม่ขึ้นใน text flow

**Symptom:** ส่งข้อความ `ค่ากาแฟ 100 บาท` → ได้ ack "รับรายการแล้วค่ะ ฿100.00 กำลังเตรียม..." แต่ **Flex Carousel project picker ไม่ตามมา**

**Root cause:** ใน `handleText` ใช้ `void processTextExpenseAsync(...).catch(...)` แทน `await` — บน Vercel serverless, function จะ return ทันทีหลัง webhook handler จบ และ runtime kill process ก่อน async background task เสร็จ

**Reference:** `handleMedia` ใช้ `await processMediaAsync(...)` มาก่อนหน้า (เห็นใน code Session 6) — เพราะเหตุนี้ image flow ทำงานปกติ

**Fix:** เปลี่ยนเป็น `await processTextExpenseAsync(...).catch(...)` พร้อมใส่ comment เตือน:
```ts
// IMPORTANT: must `await` here, not `void`. On Vercel serverless,
// returning before the picker push completes causes the runtime to
// freeze the function and the Flex Carousel never reaches the user.
await processTextExpenseAsync(lineUserId, parsed, ctx).catch((err) => { ... });
```

---

### Enhancement 2 — Loading animation 3 จุดดุ๊กดิ๊ก

**Request พี่:** เปลี่ยนข้อความ "รูปได้รับแล้วค่ะ กำลังอ่านข้อมูล..." เป็น loading animation 3 จุดดุ๊กดิ๊ก เหมือนกำลังพิมพ์ตอบ

**LINE API:** `POST https://api.line.me/v2/bot/chat/loading/start`
- Body: `{ chatId, loadingSeconds }`
- Range: 5..60 seconds, ต้อง round เป็น 5s increments
- Auto-dismiss เมื่อ push message แรก หรือ timeout
- Free for all OA channels (ไม่ต้อง premium)

---

## 📋 Implementation

### 1. New helper — `src/lib/line/messaging.ts`

```ts
const LINE_LOADING_URL = "https://api.line.me/v2/bot/chat/loading/start";

export async function showLoadingAnimation(
  chatId: string,
  loadingSeconds: number = 30,
): Promise<void> {
  const token = getChannelAccessToken();
  const clamped = Math.min(60, Math.max(5, loadingSeconds));
  const rounded = Math.ceil(clamped / 5) * 5;

  try {
    const res = await fetch(LINE_LOADING_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chatId, loadingSeconds: rounded }),
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.warn(`[LINE] Loading animation request failed: ${res.status} ${errorText}`);
    }
  } catch (err) {
    console.warn("[LINE] Loading animation request threw:", err);
  }
}
```

**Best-effort design:** errors ถูก log เป็น warn แต่ไม่ throw — animation เป็น UX nicety ไม่ใช่ critical flow

### 2. handleMedia — replace text ack
```diff
- await replyMessage(event.replyToken, [
-   text(`${displayKind}ได้รับแล้วค่ะ กำลังอ่านข้อมูล...`),
- ]);
+ await showLoadingAnimation(lineUserId, 60);
```
60s = max OCR + Drive upload time

### 3. handleText — replace text ack + fix void→await
```diff
- await replyMessage(event.replyToken, [
-   text(`รับรายการแล้วค่ะ ฿${...}\nกำลังเตรียมรายชื่อโปรเจกต์...`),
- ]);
+ await showLoadingAnimation(lineUserId, 30);

- void processTextExpenseAsync(...).catch(...);
+ await processTextExpenseAsync(...).catch(...);
```
30s = enough for sheet read + push (ปกติ < 5s)

---

## 🧪 Test Results (User-Verified)

| Flow | Loading animation | Carousel | Confirm | Save |
|------|-------------------|----------|---------|------|
| Text expense (`ค่ากาแฟ 100 บาท`) | ✅ ขึ้น | ✅ ขึ้น | ✅ | ✅ |
| Image (ใบเสร็จ Grande Centre Point) | ✅ ขึ้น | ✅ ขึ้น | ✅ | ✅ |

**Diagnostic moment ที่น่าสนใจ:** ตอนแรกพี่บอก image flow ยังเห็น text เก่า "รูปได้รับแล้ว..." → เอม diagnose ว่าอาจเป็น Vercel cache → ขอให้พี่ส่งรูปใหม่ + ดู timestamp → ปรากฏว่า message ที่พี่เห็นเป็น **history เก่าจาก test ก่อน**, ตอน send ใหม่จริง animation ขึ้นปกติ ✓

---

## 🎯 Side Effects

### Before (text ack)
```
User: ส่งใบเสร็จ
Bot:  "รูปได้รับแล้วค่ะ กำลังอ่านข้อมูล..."  ← message text formal
[5-10 วินาที]
Bot:  [summary text + Flex Carousel]
```

### After (loading animation)
```
User: ส่งใบเสร็จ
Bot:  ⋯ ⋯ ⋯  (3 จุดดุ๊กดิ๊ก animated)         ← feel เหมือนคนพิมพ์
[5-10 วินาที — animation วิ่งต่อเนื่อง]
Bot:  [summary text + Flex Carousel]         ← animation หาย auto
```

**UX improvement:**
- Message log ในแชทสะอาด (ไม่มี text "ack" ค้างอยู่)
- Feel modern, AI-like (เหมือน ChatGPT typing indicator)
- ไม่กิน screen real estate เพิ่ม

---

## ⚠️ Operational Notes

- **Channel access token** — Loading API ใช้ token เดียวกับ push/reply — ไม่ต้อง config เพิ่ม
- **Followers only** — chatId ต้องเป็น user ที่ follow OA (เหมือน push) — pre-condition เดียวกับ flow ปัจจุบัน
- **Quota** — Loading API ไม่นับเป็น push message → ไม่กระทบ Free OA quota
- **Failure handling** — ถ้า API fail (network/auth/etc) → log warn → flow เดิมยังเดินต่อ (push message เป็นปกติ ไม่มี user-visible error)

---

## 🔗 Related

- Previous: PATCH `e751b0b` (text quick entry feature)
- LINE doc: https://developers.line.biz/en/reference/messaging-api/#display-a-loading-indicator

---

*Patch by Aim — 2026-04-25 15:45 ICT*
