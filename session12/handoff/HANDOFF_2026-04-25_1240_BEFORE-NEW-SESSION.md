# Session 12 → Session 13 — Handoff Before Context Limit

> **Created:** 2026-04-25 12:40 ICT
> **Reason:** Context tracker ใกล้ 70% — เตรียมข้ามไป session ใหม่
> **Type check:** ✅ 0 errors
> **Code state:** 🟡 sandbox edits ยังไม่ได้ commit/push (พี่ต้องทำเอง)

---

## 🎯 ที่ทำใน Session 12 (สรุปสั้น)

### ✅ Issues ปิดแล้ว
1. **Schema drift** `line_drafts.event_id` — ALTER TABLE บน Supabase สำเร็จ
2. **Vercel Pro trial** — พี่ downgrade เป็น Hobby แล้ว (ปิด Priority 2)
3. **Smoke Test** — Test 1, 2, 3, 5, 6, 7 ผ่าน

### 🟡 Issues ที่ยังเปิด — ต้องลุยต่อใน Session 13
1. **OCR ยังอ่าน buyer ผิด** — ที่ถูก = "บริษัท อาร์โต จำกัด"; OCR อ่านได้สลับระหว่าง "อาซิโอ" / "อาร์โค" / "อาชิโอ"
2. **Layer 1+2 OCR fix** — เอม implement แล้ว type check ผ่าน แต่ **ยังไม่ verify ว่า deploy** (พี่บอก log ไม่ update)
3. **Quick Reply UX** — เปลี่ยนเป็น Flex Carousel + filter เฉพาะ assigned project — **เอมเขียนเสร็จแล้ว** รอ commit/push

---

## 📦 Code Changes ที่ค้างใน working dir (ยังไม่ commit)

| File | สถานะ | สรุป |
|------|-------|------|
| `src/lib/ocr/openai-provider.ts` | M | Layer 1: detail "auto"→"high", sharpen, normalize, MAX_DIM 1200→1600, JPEG 85→92 |
| `src/lib/ocr/text-similarity.ts` | A (NEW) | Levenshtein + findBestMatch utility |
| `src/server/services/google-sheets.service.ts` | M | + `getConfigMap()` (robust) + `getEventIdsAssignedToUser()` |
| `src/lib/line/handlers.ts` | M | Vendor fuzzy match + `applyBuyerAutoCorrect()` + tolerant Status filter + Flex Carousel + filter assigned events |
| `src/lib/line/flex/project-picker.ts` | A (NEW) | Flex Carousel builder (max 12 bubbles) |
| `session12/handoff/*` + `session12/notes/*` | A (NEW) | เอกสาร handoff + bug fix ของ Session 12 |

---

## 🚀 Action Items สำหรับ Session 13 (เริ่มต้นที่นี่!)

### A. ก่อนอื่น — Verify push state

```bash
cd "/Users/pimratraa./Desktop/Mac Cowork/Aim Expense V2/aim-expense"
git log --oneline -5
git status --short
```

ถ้ามี uncommitted changes → commit ทั้งหมด:

```bash
git add -A
git commit -m "feat(line): improve Thai OCR + project picker UX

OCR Layer 1 — image quality:
- detail 'auto' -> 'high' in callVisionDirect
- prepareImageForGpt: rotate (EXIF) + normalize + sharpen
- MAX_DIM 1200 -> 1600, JPEG 85 -> 92

OCR Layer 2 — fuzzy match + Config-driven buyer auto-correct:
- New text-similarity.ts (Levenshtein + findBestMatch)
- Vendor matching: substring -> fuzzy (threshold 0.7)
- New sheets.getConfigMap() with header auto-detect
- applyBuyerAutoCorrect overrides ocr.buyer* via Config sheet

Project picker UX:
- Replace LINE Quick Reply with Flex Carousel (max 12 bubbles)
- Filter to events the user is assigned to (EventAssignments)
- Tolerant Status filter (case-insensitive + trim)
- Add debug logs for active project counts and statuses"
git push
```

### B. ตั้ง Config sheet (ตรวจให้แน่ใจ)

ใน Google Sheet ของ org → tab `Config` (case-sensitive!) → ตรวจว่ามี:

| A (Key) | B (Value) |
|---------|-----------|
| `BUYER_NAME` | `บริษัท อาร์โต จำกัด` ← **ต ไม่ใช่ ด!** |
| `BUYER_TAX_ID` | `0105546106467` |
| `BUYER_BRANCH` | `สำนักงานใหญ่` |
| `BUYER_ADDRESS` | `902 ถนนศรีนครินทร์ แขวงพัฒนาการ เขตสวนหลวง กรุงเทพมหานคร 10250` |

### C. ตรวจสิทธิ์ user ใน EventAssignments

ใน Sheet → tab `EventAssignments` → ตรวจว่า user (พี่) มี row:
- `UserID` = `<user.id ของพี่ใน Aim Expense>` (ดูจาก Prisma User table)
- `EventID` = ของ project ที่อยาก assign

ถ้าไม่มี row → Carousel จะ fallback ไป "ไม่ระบุโปรเจกต์" + Confirm Flex

### D. Re-test LINE OA

ส่งใบเสร็จ Grande Centre Point Pattaya → คาดหวัง:

1. **Text message:** สรุป OCR (ฺBuyer = "บริษัท อาร์โต จำกัด" ← canonical จาก Config!)
2. **Flex Carousel:** swipe เลือก project (เฉพาะที่ assigned) — **ไม่มี Quick Reply bar แล้ว**
3. กดปุ่ม "เลือก" บน bubble → ระบบส่ง confirm Flex card
4. ดู Vercel Logs:
   - `[LINE] Project picker: N assigned-active (of M events, K assignments) — statuses: ...`
   - `[LINE] Buyer auto-corrected: "..." → "บริษัท อาร์โต จำกัด" (taxId match: ..., name score: ...)`
   - `[LINE] Vendor fuzzy match: "..." → "..." (score ...)`

---

## 🐛 Issue ที่ยัง mystery — "OCR กลับไป อาชิโอ"

**Symptom:** Layer 1 deployed → "อาร์โค" (ดี) → จากนั้นกลับไป "อาชิโอ" (เดิม)

**Hypothesis:**
1. Code Layer 1 ไม่ได้ deploy จริง (cache / failed deploy / wrong branch)
2. Image quality ของรูปแต่ละครั้งต่างกัน (ลื่น/มุม)
3. Vercel serve old version — ตรวจ Deployments tab ว่า latest deploy "Ready" แล้ว
4. Multiple Vercel projects — production deploy อยู่ที่ไหน

**Diagnostic ที่ต้องทำ Session 13:**
- ดู Vercel Deployments tab → commit hash ของ production
- compare กับ `git log -1` บน main
- ถ้า hash ไม่ตรง → trigger redeploy manually
- ถ้าตรง → ดู function logs ของ webhook → ว่ามี log `[OCR]` หรือไม่

---

## 🧹 Cleanup ค้างจาก Session 11 (ยังต้องทำ)

```bash
rm src/lib/ocr/pdf-to-png-server.ts
rm -rf src/app/api/webhook
rm -rf src/app/documents/wth-cert
git add -A && git commit -m "chore: remove dead Phase 5 files" && git push
```

---

## 📋 Session 13 — Prompt ที่จะใช้

```
สวัสดีค่ะเอม นี่คือ session ต่อจาก Session 12 ของ Aim Expense V2

📖 อ่าน context ก่อนเริ่มงาน
โปรดอ่านไฟล์เหล่านี้ตามลำดับ (อยู่ใน folder aim-expense/session12/):

1. handoff/HANDOFF_2026-04-25_1240_BEFORE-NEW-SESSION.md — สถานะล่าสุด + Action Items
2. handoff/HANDOFF_2026-04-25_1130_OCR-FIX-READY.md — รายละเอียด Layer 1+2
3. notes/CORRECTION_2026-04-25_1140_buyer_name_arto_not_ardo.md — ground truth ชื่อบริษัท
4. notes/BUG-FIX_2026-04-25_1210_quick_reply_and_buyer_resilience.md — defensive parsing
5. ../HANDOFF.md — Session 11 (Vercel deploy) — ใช้เป็น overall context

🎯 สถานะ
- Phase 1-3: ✅ 100%
- Phase 4 Reports: ❌ ยังไม่เริ่ม
- Phase 5 LINE: ✅ 95% (deployed) — แต่ OCR + UX ยัง tune ต่อ
- Phase 6 Billing: ❌ ยัง

🚀 งาน Session 13 ลำดับ:
1. **Verify code deploy** — git log + Vercel Deployments tab
2. **Re-test LINE OA** ตาม Action Items ใน HANDOFF_1240
3. **Debug OCR ถ้ายังผิด** — ดู rawText ใน line_drafts.ocr_json
4. **เริ่ม Phase 4 Session 12A** (ถ้า OCR + UX ผ่าน) — Shared components
   (StatCard, DataTable, DateRangePicker, ExportButton)

⚠️ Known Issues
- OCR ใบเสร็จขนาดเล็ก/font ไทยพิเศษ ยังพลาดตัว ต/ค/อ/ด/ร/ซ — ใช้ Config + fuzzy override
- Vercel Hobby plan limit function timeout 10s — LINE webhook อาจ cold start ใกล้ limit
- session12/ มี handoff/ + checklists/ + notes/ — บันทึกไฟล์ใหม่ทุกครั้ง suffix _YYYY-MM-DD_HHMM
```

---

## 🔄 Git State ตอนปิด Session 12

```
Branch: main
Latest committed: 6b1dab8 fix: wrap /login useSearchParams in Suspense boundary
Working dir: 5 files modified, 2 files added, plus session12/ docs
```

---

*Handoff by Aim — 2026-04-25 12:40 ICT*
