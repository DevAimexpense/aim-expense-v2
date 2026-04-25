# Session 12 — OCR Fix Ready for Deploy

> **Created:** 2026-04-25 11:30 ICT
> **Status:** 🟡 Code เสร็จ — รอพี่ commit + push (sandbox commit ไม่ได้)
> **Type check:** ✅ 0 errors

---

## 🎯 สิ่งที่ทำใน Turn นี้

### Layer 1 — Image Quality (✅ เสร็จ)
**File:** `src/lib/ocr/openai-provider.ts`
- `prepareImageForGpt` — เพิ่ม `.rotate()` (EXIF) + `.normalize()` (auto contrast) + `.sharpen({sigma:0.8})` + JPEG quality 85→92
- `MAX_DIM` 1200 → 1600 (ตรงกับ GPT-4o high-detail sampling 1568px)
- `callVisionDirect` — `detail: "auto"` → `"high"`

### Layer 2 — Fuzzy Match + Buyer Auto-correct (✅ เสร็จ)
**New file:** `src/lib/ocr/text-similarity.ts`
- `levenshtein()` — edit distance
- `similarity()` — score 0..1, normalize ภาษาไทย + strip "บริษัท..." / "...จำกัด" / "Co.,Ltd"
- `findBestMatch()` — pick best match จาก list ด้วย threshold (default 0.7)

**Updated:** `src/server/services/google-sheets.service.ts`
- `getConfigMap()` — อ่าน Config tab เป็น `Record<key, value>` (graceful — return `{}` ถ้าว่าง)

**Updated:** `src/lib/line/handlers.ts`
- `applyBuyerAutoCorrect()` — ตรวจ ocr.buyer vs Config (BUYER_NAME / BUYER_TAX_ID) → override ถ้า tax exact หรือ name fuzzy ≥0.7
- Vendor matching เปลี่ยนจาก `.includes()` เป็น `findBestMatch(threshold:0.7)` → ทนต่อ OCR misread

---

## 🚀 ขั้นตอนพี่ต้องทำเอง

### 1. Commit + Push (VS Code Terminal)

```bash
cd "/Users/pimratraa./Desktop/Mac Cowork/Aim Expense V2/aim-expense"

git add -A
git commit -m "feat(ocr): improve Thai OCR accuracy for buyer/vendor names

Layer 1 — Image quality (OpenAI provider):
- detail 'auto' -> 'high' in callVisionDirect
- prepareImageForGpt: rotate (EXIF) + normalize + sharpen
- MAX_DIM 1200 -> 1600, JPEG quality 85 -> 92

Layer 2 — Fuzzy match + Config-driven buyer auto-correct:
- New text-similarity.ts (Levenshtein + findBestMatch)
- Vendor: substring -> fuzzy (threshold 0.7)
- New sheets.getConfigMap() reads Config tab
- New applyBuyerAutoCorrect: BUYER_TAX_ID exact OR BUYER_NAME fuzzy
  recovers from Thai misreads (อาซิโอ -> อาร์โด)"

git push
```

Vercel จะ auto-redeploy ใน 2-4 นาที

### 2. ตั้ง Buyer Config ใน Google Sheets (ใช้ Layer 2 ได้เต็มที่)

เปิด Google Sheet ของ org → tab `Config` → เพิ่ม 4 rows:

| Key | Value |
|-----|-------|
| `BUYER_NAME` | `บริษัท อาร์โด จำกัด` |
| `BUYER_TAX_ID` | `0105546106467` |
| `BUYER_BRANCH` | `สำนักงานใหญ่` |
| `BUYER_ADDRESS` | `902 ถนนศรีนครินทร์ แขวงพัฒนาการ เขตสวนหลวง กรุงเทพมหานคร 10250` |

**ถ้าไม่ตั้ง Config:**
- Layer 2 buyer auto-correct จะ skip (graceful — ไม่ error)
- แต่ Layer 1 (image quality) + Vendor fuzzy ยังทำงาน

### 3. Re-test LINE OA

ส่งใบเสร็จ Grande Centre Point Pattaya เดิม → คาดหวัง:
- ✅ Flex card "ผู้ซื้อ" = "บริษัท อาร์โด จำกัด" (ไม่ใช่ "อาซิโอ")
- ✅ Tax ID = 0105546106467
- ✅ Branch = สำนักงานใหญ่

ส่งใบเสร็จอื่น 1-2 ใบ → ดู accuracy ทั่วไป

---

## 📊 สถานะ Smoke Test (ปรับปรุง)

| Test | สถานะ |
|------|-------|
| 1 Login Page | ✅ |
| 2 LINE Login | ✅ |
| 3 Google OAuth | ✅ |
| 4 LINE OA Receipt | 🟡 ใช้ได้แล้ว แต่รอเทส OCR fix รอบใหม่ |
| 5 Web Payment + Receipt | ✅ |
| 6 Data Integrity | ✅ |
| 7 Vercel Logs | ✅ |
| **Vercel plan** | ✅ Hobby (downgrade แล้ว) |

---

## 🧹 Cleanup ที่ค้างจาก Session 11 (ยังต้องทำ)

```bash
cd "/Users/pimratraa./Desktop/Mac Cowork/Aim Expense V2/aim-expense"
rm src/lib/ocr/pdf-to-png-server.ts
rm -rf src/app/api/webhook
rm -rf src/app/documents/wth-cert
git add -A && git commit -m "chore: remove dead Phase 5 files" && git push
```

แนะนำทำหลัง re-test ผ่าน เพื่อกัน rollback ยุ่งยาก

---

## 📊 Context Tracker

| Turn | Action | Context Est. |
|------|--------|--------------|
| 1 | Kickoff + checklist + handoff | ~15-20% |
| 2 | Schema drift fix (event_id) | ~25-30% |
| 3 | Buyer OCR diagnosis (อาร์โด) | ~38-42% |
| 4 | Layer 1+2 implement + handoff | ~50-55% |

**Threshold เตือน:** 70% — ยังห่าง สบายๆ

---

## 🎯 Next Step (หลังพี่ deploy + เทสผ่าน)

1. **ถ้า OCR fix ดี** → ลุย **Session 12A — Shared Components** (Phase 4)
2. **ถ้ายังพลาด** → debug ลึก: query line_drafts.ocr_json ดู rawText vs buyerName หา Layer 3 (proper company dictionary in prompt)

---

*Handoff by Aim — 2026-04-25 11:30 ICT*
