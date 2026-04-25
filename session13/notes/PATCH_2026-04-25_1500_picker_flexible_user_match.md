# Patch Note — Flexible UserID Match for Project Picker

> **Created:** 2026-04-25 15:00 ICT
> **Status:** ✅ Code applied (3 files) + Type check passed | ⏳ Awaiting commit (blocked by git lock)
> **Files:** `google-sheets.service.ts` / `user-org.ts` / `handlers.ts`

---

## 🐛 Bug ที่แก้

**Symptom:** ส่งใบเสร็จเข้า LINE OA → OCR ทำงานดี → แต่ไม่มี Flex Carousel ให้เลือก project → ระบบบันทึกอัตโนมัติเข้า "LINE Quick Capture" event

**Vercel log ก่อนแก้:**
```
[LINE] Project picker: 0 assigned-active (of 2 events, 0 assignments) — statuses: "active"
                                              ^^^^^^^^^^^^^
                                              0 assignments แม้ใน sheet มี row ของ user
```

**Root cause:** `getEventIdsAssignedToUser` ใช้ `getFiltered` ที่ทำ exact-string match (`===`) — Prisma `user.id` (UUID) ไม่ตรงกับ value ใน `EventAssignments.UserID` ที่ user มักใส่เป็น email หรือ display name

---

## 🔧 Fix Strategy — Flexible Match

### Layer 1: Multi-identifier match
ส่ง `ctx.user` object เต็มเข้าไปแทน `ctx.user.id` — ลองเทียบทุก identifier ที่ user อาจใส่ใน sheet:
- `user.id` (UUID จาก Prisma) — canonical
- `user.email` — มนุษย์อ่านง่ายสุด, ใส่ใน sheet บ่อย
- `user.lineUserId` — LINE-specific ID (`Uxxxxxxxxx`)
- `user.lineDisplayName` — ชื่อโปรไฟล์ LINE

ถ้า `UserID` ใน sheet ตรงกับ**ตัวใดตัวหนึ่ง** (case-insensitive + trim) → match ✓

### Layer 2: Whitespace tolerance
`EventID` ทั้งสองฝั่ง (จาก Events tab vs จาก EventAssignments tab) ทำ `.trim()` ก่อน Set membership check — กัน trailing space ที่เกิดจาก copy-paste

### Layer 3: Diagnostic log on miss
ถ้า 0 rows match — log warn พร้อม sample 5 UserIDs จาก sheet → ครั้งหน้า Vercel log จะบอกตรงๆ ว่า sheet ใส่ค่าอะไร

---

## 📋 Files Touched

| File | Change | Lines |
|------|--------|-------|
| `src/server/services/google-sheets.service.ts` | `getEventIdsAssignedToUser`: signature + flexible match + diagnostic | +48 / -2 |
| `src/lib/line/user-org.ts` | `LineUserContext.user` เพิ่ม `email` field + select เพิ่ม | +2 / -0 |
| `src/lib/line/handlers.ts` | ส่ง `ctx.user` (object), trim EventID, type ของ ctx param | +14 / -5 |
| **Total** | | **+64 / -7** |

Type check: `npx tsc --noEmit` → 0 errors ✓

---

## 🧪 Expected Behavior After Deploy

### กรณีที่ 1: User ใส่ UserID เป็น email ใน sheet
**Before:** 0 assignments → fallback ไป "LINE Quick Capture"
**After:** match สำเร็จ → Flex Carousel ขึ้น ✓

### กรณีที่ 2: EventID มี trailing space
**Before:** `assignedSet.has("EVT001")` → false (sheet มี `"EVT001 "`)
**After:** ทั้งสองฝั่ง `.trim()` → match ✓

### กรณีที่ 3: ทุก identifier ไม่ match (data ผิดจริง)
**Before:** `Found 0 active project(s)` — ไม่รู้ทำไม
**After:** log ใหม่ `[Sheets] EventAssignments: 0 rows matched 4 candidate identifier(s) — Sample UserIDs: "...", "..."` → debug ได้ทันที

---

## ⚠️ Limitations

- ถ้า user ใส่ UserID เป็นค่าอื่นที่**ไม่อยู่ใน 4 candidates** (เช่น org ตั้งรหัสภายในเอง) → ยัง match ไม่ได้
  → workaround: ขอให้ใช้หนึ่งใน 4 ค่ามาตรฐาน (UUID/email/lineUserId/displayName)
- Fuzzy match ระดับ Levenshtein **ยังไม่เพิ่ม** สำหรับ UserID — เพราะค่า ID ไม่ควร tolerant typo (security implication)

---

## 🔗 Related

- Session 12 patch: `HANDOFF_2026-04-25_1240_BEFORE-NEW-SESSION.md` — Flex Carousel introduction
- Session 12 bug fix: `BUG-FIX_2026-04-25_1210_quick_reply_and_buyer_resilience.md` — tolerant Status filter
- Session 13 handoff: `HANDOFF_2026-04-25_1500_BLOCKED-BY-GIT-LOCK.md` — full session summary

---

*Patch by Aim — 2026-04-25 15:00 ICT*
