# Patch Note — Quick Text Expense Entry

> **Created:** 2026-04-25 15:30 ICT
> **Commit:** `e751b0b` feat(line): quick text expense entry
> **Files:** 2 (1 new, 1 modified) — +298 / -49

---

## 🎯 Feature

ผู้ใช้สามารถพิมพ์ข้อความที่มีตัวเลข เช่น `ค่ากาแฟ 100 บาท` เข้า LINE OA → ระบบบันทึกเป็นรายจ่ายผ่าน flow เดียวกับการส่งใบเสร็จ (Flex Carousel project picker → confirm → save) **โดยไม่ต้องแนบไฟล์**

---

## 🧠 Design Decisions (ถามพี่ + เลือก Recommended ทั้งหมด)

| Decision | Choice | Reason |
|----------|--------|--------|
| **Trigger** | พิมพ์อะไรก็ได้ที่มีตัวเลข | Friction ต่ำสุด — ไม่ต้องจำ command |
| **Field mapping** | Description = ทั้งข้อความ, ไม่มี vendor | "ค่ากาแฟ" ไม่ใช่ vendor; user แก้เพิ่มในเว็บได้ |
| **Defaults** | ไม่มี VAT/WHT, DocumentType=receipt | รายจ่ายเล็กส่วนใหญ่ไม่มี VAT |
| **Schema** | imageMessageId=`text:{nanoid}` + skip Drive upload | Reuse LineDraft schema เดิม — ไม่ต้อง migrate |

---

## 📋 Implementation

### 1. New File: `src/lib/line/parse-text-expense.ts` (50 lines)

```ts
export interface ParsedTextExpense {
  amount: number;
  description: string;
}

export function parseTextExpense(rawText: string): ParsedTextExpense | null {
  const text = (rawText || "").trim();
  if (!text) return null;
  const re = /(?:^|[\s฿])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/;
  const m = text.match(re);
  if (!m) return null;
  const numeric = m[1].replace(/,/g, "");
  const amount = parseFloat(numeric);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, description: text };
}
```

**Test results (14 cases):**
| Input | Result |
|-------|--------|
| `ค่ากาแฟ 100 บาท` | ✓ amount=100 |
| `แท็กซี่ 250` | ✓ amount=250 |
| `Starbucks 150` | ✓ amount=150 |
| `1,234.50 บาท` | ✓ amount=1234.50 (comma OK) |
| `฿100` | ✓ amount=100 (currency prefix OK) |
| `ค่าโอเลี้ยง 35.5 บาท` | ✓ amount=35.5 (decimal OK) |
| `ค่ากาแฟ` (no number) | ✓ null |
| `ทำงาน` (no number) | ✓ null |
| `""` / `"  "` (empty) | ✓ null |
| `iPhone 15` | ⚠️ amount=15 (false positive, รับได้ระดับ MVP) |

### 2. Modified: `src/lib/line/handlers.ts`

#### 2a. handleText — Branching
```ts
// Help
if (lower === "help" || lower === "ช่วย" || lower === "?") { ... }

// Quick text expense — message contains a number
const parsed = parseTextExpense(rawText);
if (parsed) {
  // resolve ctx, gate by onboarding
  // Acknowledge: "รับรายการแล้วค่ะ ฿{amount} กำลังเตรียม..."
  // Run picker flow async
}

// Default — echo
```

> **Note:** ตอน initial commit `e751b0b` ใช้ `void processTextExpenseAsync(...)` — bug ที่ Vercel kill function ก่อน async finish — fix ใน commit `cf5f6dc` (เปลี่ยนเป็น `await`)

#### 2b. New: `processTextExpenseAsync(lineUserId, parsed, ctx)`

```ts
const ocr: OcrParsedReceipt = {
  vendorName: null,                        // user แก้ในเว็บได้
  // ... null fields ...
  documentType: "receipt",
  documentDate: today,
  subtotal: parsed.amount,
  totalAmount: parsed.amount,
  vatAmount: null,
  hasVat: false,
  confidence: 1,                           // user-typed → no uncertainty
  rawText: parsed.description,
  provider: "manual",                      // already in OcrParsedReceipt union
};

await prisma.lineDraft.create({
  data: {
    lineUserId,
    userId: ctx.user.id,
    orgId: ctx.orgId,
    imageMessageId: `text:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    mimeType: "text/plain",
    ocrJson: ocr,
    expiresAt,
  },
});

// Same picker logic as processMediaAsync
// → Filter to active assigned events → Carousel max 12 bubbles
```

#### 2c. confirmDraftAsync — Branching for text vs image

```ts
const isTextEntry = draft.imageMessageId.startsWith("text:");

let receiptUrl = "";
if (!isTextEntry) {
  // Re-download from LINE + upload to Drive (เดิม)
  const upload = await drive.uploadPaymentFile(...);
  receiptUrl = upload.webViewLink;
  await prisma.lineDraft.update({ ... driveFileId, driveFileUrl ... });
} else {
  console.log(`[LINE] Confirming text-entry draft ${draft.id} — skipping Drive upload`);
}

// ตอน append PAYMENTS row:
const paymentDescription = isTextEntry
  ? `${ocr.rawText || "บันทึกจาก LINE"} (LINE - ข้อความ)`
  : ocr.vendorName ? `${ocr.vendorName}... (LINE)` : "บันทึกจาก LINE";

const notes = isTextEntry
  ? `Manual text entry | LINE draft ${draft.id}`
  : `OCR confidence ${...}% | LINE draft ${draft.id}`;
```

#### 2d. Audit log + savedFlex labels
```ts
const auditPrefix = isTextEntry ? "LINE Text" : "LINE OCR";
const savedLabel = isTextEntry
  ? (ocr.rawText?.slice(0, 40) || "บันทึกจาก LINE")
  : (ocr.vendorName || "บันทึกจาก LINE");
```

---

## 🎁 Bonus: Help Message ปรับใหม่

```
วิธีใช้งาน

1) ส่งรูปใบเสร็จ/ใบกำกับภาษี
   → ระบบ OCR → เลือกโปรเจกต์ → ยืนยัน → บันทึก

2) บันทึกแบบรวดเร็วด้วยข้อความ
   พิมพ์เช่น "ค่ากาแฟ 100 บาท" หรือ "แท็กซี่ 250"
   → เลือกโปรเจกต์ → ยืนยัน → บันทึก (ไม่ต้องแนบไฟล์)
```

---

## ⚠️ Known Limitation

**False positive:** `iPhone 15` → parse เป็น amount=15
- User เห็น summary "฿15.00" → กดยกเลิกได้
- รับได้ระดับ MVP
- **Future fix idea:** word-boundary check (ตัวเลขต้องอยู่หน้า "บาท"/"baht"/"฿") หรือ minimum amount threshold

---

## 🔗 Related

- Initial bug: discovered Session 14 — text flow ack ขึ้นแต่ carousel ไม่ตามมา
- Fix bug: PATCH `cf5f6dc` (next note)
- Spec ground truth: ที่พี่ขอใน Session 14 + AskUserQuestion 4 ข้อ

---

*Patch by Aim — 2026-04-25 15:30 ICT*
