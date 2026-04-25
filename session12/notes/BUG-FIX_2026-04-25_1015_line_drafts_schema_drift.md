# Bug Fix Log — line_drafts schema drift

> **Created:** 2026-04-25 10:15 ICT
> **Test:** Smoke Test — Test 4 (LINE OA Receipt)
> **Severity:** 🔴 HIGH (LINE webhook ใช้ไม่ได้ทั้งหมด)
> **Status:** 🛠 รอพี่รัน SQL

---

## 🐛 Bug Report

**Trigger:** ส่งรูปใบเสร็จไปที่ LINE OA `@064qycfu` ใน production

**Error message:**
```
Invalid `prisma.lineDraft.create()` invocation:
The column `line_drafts.event_id` does not exist in the current database.
```

**Impact:** LINE webhook handler ทุก path ที่เรียก `lineDraft.create()` พังหมด → OCR + Flex card ไม่ทำงานเลย

---

## 🔍 Root Cause

| ตัวแปร | ค่า |
|--------|-----|
| Prisma schema (code) | มี `event_id`, `event_name` (model `LineDraft` line 279-280) |
| Production DB (Supabase) | **ไม่มี** column `event_id` (schema เก่า ก่อน Phase 5) |
| Migration history | **ไม่มี** — project ใช้ `prisma db push` mode |
| Vercel build script | `next build` + `prisma generate` (ไม่มี db sync) |

**สรุป:** เพิ่ม column ใน schema ตอน Phase 5 → local push → deploy แต่ Vercel ไม่ sync schema กลับเข้า Supabase → drift

---

## ✅ Fix Plan (Option: Manual SQL)

### ขั้นที่ 1 — ตรวจ column ที่หายไปจริงๆ ก่อน

ใน Supabase Dashboard → SQL Editor → รัน:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'line_drafts'
ORDER BY ordinal_position;
```

**Expected columns ตาม schema (14 ตัว):**
| ลำดับ | Column | Type | Nullable |
|-------|--------|------|----------|
| 1 | `id` | uuid/text | NO |
| 2 | `line_user_id` | text | NO |
| 3 | `user_id` | text | NO |
| 4 | `org_id` | text | NO |
| 5 | `image_message_id` | text | NO |
| 6 | `mime_type` | text | NO (default `image/jpeg`) |
| 7 | `ocr_json` | jsonb | NO |
| 8 | `event_id` | text | YES |
| 9 | `event_name` | text | YES |
| 10 | `drive_file_id` | text | YES |
| 11 | `drive_file_url` | text | YES |
| 12 | `status` | text | NO (default `pending`) |
| 13 | `created_at` | timestamp(3) | NO (default now) |
| 14 | `expires_at` | timestamp(3) | NO |

ถ้าผลที่ได้ขาด column ไหน → ใช้ ALTER ในขั้น 2

---

### ขั้นที่ 2 — ALTER TABLE (idempotent — รันซ้ำได้ปลอดภัย)

```sql
-- Aim Expense V2 — Fix line_drafts schema drift (Phase 5 columns)
-- Run in Supabase SQL Editor — idempotent (ใช้ IF NOT EXISTS)

ALTER TABLE public.line_drafts
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS event_name TEXT,
  ADD COLUMN IF NOT EXISTS drive_file_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_file_url TEXT;

-- Verify (ดูว่าครบ)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'line_drafts'
ORDER BY ordinal_position;
```

**หมายเหตุ:**
- 4 columns ที่ ALTER เป็น `nullable` ตาม schema (`String?` ใน Prisma) → ปลอดภัย ไม่กระทบข้อมูลเก่า
- ใช้ `IF NOT EXISTS` → รันซ้ำกี่ครั้งก็ไม่ error
- ไม่ต้อง backfill เพราะเป็น nullable

---

### ขั้นที่ 3 — Verify (โดยไม่ต้อง redeploy)

หลังรัน SQL เสร็จ → ส่งรูปไป LINE OA อีกครั้ง → ดู:
- ✅ ไม่มี Prisma error ใน Vercel Logs
- ✅ Flex card ตอบกลับภายใน 15s
- ✅ row ใหม่ใน table `line_drafts` (เช็คใน Supabase Table Editor)

**ไม่ต้อง redeploy Vercel** — Prisma Client ใน production จะ query ได้ทันทีหลัง column ถูกเพิ่ม

---

## 🛡 Long-term Prevention (เก็บไว้ทำใน Session ถัดไป)

ปัญหานี้จะวนซ้ำทุกครั้งที่เพิ่ม field ใน Prisma schema → ต้อง automate:

**ทางเลือกที่ 1 — เพิ่ม `prisma db push` ใน Vercel build (ง่าย):**
```json
"build": "prisma generate && prisma db push --accept-data-loss && next build"
```
⚠️ `--accept-data-loss` อันตรายในระยะยาว (จะลบ column ถ้าหายจาก schema)

**ทางเลือกที่ 2 — Migrate proper (recommended ถ้ามีเวลา):**
1. `npx prisma migrate dev --name init_phase5` (init migration history)
2. แก้ build: `"build": "prisma generate && prisma migrate deploy && next build"`
3. ทุกการเปลี่ยน schema = สร้าง migration ใหม่ → commit → push → Vercel apply อัตโนมัติ

**คำแนะนำเอม:** Session 12 หลังเสร็จ smoke test → แยก mini-task "setup prisma migrate" ก่อนเข้า Phase 4 จะดีมาก เพราะ Phase 4 อาจมีเพิ่ม column สำหรับ reports

---

## 📋 Action Items

- [ ] **พี่:** เปิด Supabase Dashboard → SQL Editor → รัน SQL ในขั้นที่ 2
- [ ] **พี่:** เทส LINE OA อีกครั้ง (ส่งรูปใบเสร็จ)
- [ ] **พี่:** แจ้งเอมผล (ผ่าน/ไม่ผ่าน + Vercel log error ถ้ามี)
- [ ] **เอม:** อัปเดต handoff + ปิด bug task
- [ ] **เอม (เซสชั่นต่อ):** วางแผน setup prisma migrate (long-term fix)

---

*Bug fix log by Aim — 2026-04-25 10:15 ICT*
