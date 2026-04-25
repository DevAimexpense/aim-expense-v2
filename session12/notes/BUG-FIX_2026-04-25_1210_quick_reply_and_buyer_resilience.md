# Bug Fix Log — Quick Reply Empty + Buyer Auto-correct Not Working

> **Created:** 2026-04-25 12:10 ICT
> **Symptoms:** หลัง deploy Layer 1+2 + ตั้ง Config sheet แล้ว
> 1. ส่งรูป → Quick Reply ขึ้นแต่ไม่มี project ให้เลือก
> 2. OCR อ่าน buyer = "อาร์โค" — Layer 2 ไม่ override เป็น "อาร์โต"
> **Status:** 🛠 Code defensive แล้ว — รอ commit + push + verify

---

## 🔍 Root Cause Hypotheses

ทั้งสองปัญหาน่าจะมีต้นตอเดียวกัน: **Sheet rows ถูก parse ผิดเพราะ header/case mismatch**

### ปัญหา 1: Quick Reply ไม่มี project

```ts
// handlers.ts (เดิม)
.filter((e) => e.Status === "active" || e.Status === "Active")
```

ถ้า `e.Status` =
- `"ACTIVE"` (uppercase) → ❌ filter fail
- `"active "` (trailing space) → ❌ filter fail
- `"Active "` → ❌ filter fail

→ activeEvents.length = 0 → fallback ไปใช้ default project → ไม่มี Quick Reply / มีแต่ปุ่มว่าง

### ปัญหา 2: Buyer auto-correct ไม่ทำงาน

```ts
// google-sheets.service.ts (เดิม) — ใช้ getAll() ที่ใช้ row 1 เป็น header
async getConfigMap() {
  const rows = await this.getAll(SHEET_TABS.CONFIG);
  for (const row of rows) {
    const key = (row.Key || "").trim();  // ← row.Key undefined ถ้า header ไม่ตรง
    ...
  }
}
```

ถ้า user สร้าง Config tab เอง:
- ไม่มี header row เลย → row 1 ของ user data ถูก map เป็น header → ทำให้ key มี value ผิด/หายไป
- หรือ header สะกด `key`/`KEY`/`คีย์` → row.Key undefined

→ `getConfigMap()` return `{}` → `applyBuyerAutoCorrect` skip silently

---

## ✅ Fixes Applied

### Fix 1 — Tolerant event status filter

**File:** `src/lib/line/handlers.ts`

```diff
- .filter((e) => e.Status === "active" || e.Status === "Active")
+ .filter((e) => (e.Status || "").trim().toLowerCase() === "active")
+ .slice(0, 13);
+
+ console.log(
+   `[LINE] Found ${activeEvents.length} active project(s) (of ${events.length} total)` +
+     ` — statuses: ${[...new Set(events.map((e) => JSON.stringify(e.Status || "")))].join(", ")}`,
+ );
```

**Bonus:** เพิ่ม log บอก count + statuses ที่เจอ — ช่วย debug ใน Vercel logs

### Fix 2 — Robust getConfigMap

**File:** `src/server/services/google-sheets.service.ts`

- Bypass `getAll()` (ไม่ใช้ row 1 เป็น header)
- อ่าน `Config!A:B` ตรง → detect header row อัตโนมัติ (ถ้า A1 = "key"/"Key"/"KEY" → skip)
- รองรับ case ที่ user สร้าง tab เองและใส่ data ตั้งแต่ row 1
- try/catch — ถ้า tab ไม่มี → return `{}` graceful

---

## 🚀 Next Steps สำหรับพี่

### 1. Commit + Push (อีกรอบ)

```bash
cd "/Users/pimratraa./Desktop/Mac Cowork/Aim Expense V2/aim-expense"
git add -A
git commit -m "fix(line): tolerant event status filter + robust Config parser

- Event status filter now case-insensitive + trim (handles 'Active '/'ACTIVE')
- Add debug log showing active project count + status variants
- getConfigMap reads Config!A:B directly with header auto-detect
  (handles user-created tabs without proper header row)
- Both changes graceful — return {} or [] instead of throw"
git push
```

### 2. ดู Vercel Logs หลัง deploy + ส่งรูปใหม่

ใน Vercel Dashboard → `aim-expense-v2` → **Logs** → Last hour → filter `LINE`

มองหาบรรทัด:
- `[LINE] Found N active project(s) (of M total) — statuses: ...`
- `[LINE] Buyer auto-corrected: "..." → "..." (taxId match: ..., name score: ...)` หรือ
- `[LINE] Vendor fuzzy match: "..." → "..." (score ...)`

**ถ้า log บอก `Found 0 active project(s) (of N total) — statuses: "Active "`:**
→ status ใน sheet มี trailing space — fix ใน sheet หรือใช้ filter ใหม่ที่ trim แล้ว ✅

**ถ้า log ไม่มี `Buyer auto-corrected` เลย:**
→ Config tab อ่านไม่ได้ → ขอ screenshot tab Config ปัจจุบัน

### 3. ขอ screenshot Config tab (ถ้าทดสอบยังไม่ทำงาน)

screenshot ของ tab `Config` ใน Google Sheets — เอมจะดู:
- Header row มีจริงไหม
- "Key" / "Value" สะกดถูกไหม
- Data row 2-5 ใส่ค่าที่ถูกไหม

---

## 📋 Summary

| Issue | Fix | File |
|-------|-----|------|
| Quick Reply empty | tolerant Status filter (trim+lowercase) | `handlers.ts` |
| Buyer not corrected | robust Config parser (auto-detect header) | `google-sheets.service.ts` |
| ทั้งคู่ | + debug logs ใน Vercel logs | both |

**Type check:** ✅ 0 errors

---

*Bug fix by Aim — 2026-04-25 12:10 ICT*
