# Smoke Test Checklist — Production Deploy

> **Session 12 — Priority 1**
> สร้างเมื่อ: 2026-04-25 09:51 ICT
> Target: `https://aim-expense-v2.vercel.app`
> เวลาที่คาดการณ์: ~30 นาที
> วิธีใช้: ทำทีละข้อ ติ๊ก ✅ / ❌ ลงช่อง Result + จด log/screenshot ถ้าเจอปัญหา

---

## Pre-flight ก่อนเริ่ม

- [ ] เปิด https://aim-expense-v2.vercel.app ใน browser ใหม่ (แนะนำ Incognito เพื่อกัน cookie เก่า)
- [ ] เปิด tab แยก: Vercel Dashboard → Project `aim-expense-v2` → Logs (ค้างไว้ดู real-time)
- [ ] เปิด tab แยก: Google Sheets — sheet ที่ใช้ prod
- [ ] เปิด tab แยก: Google Drive — folder receipts/
- [ ] เตรียมรูปใบเสร็จ 1 ใบ (JPG/PNG) สำหรับทดสอบ LINE OA
- [ ] Add LINE OA `@064qycfu` ใน LINE app ถ้ายังไม่ได้เพิ่ม

---

## Test 1 — Landing / Login Page (2 นาที)

| # | ขั้น | Expected | Result | Note |
|---|------|----------|--------|------|
| 1.1 | เปิด `/` | Redirect ไป `/login` หรือ landing | ☐ | |
| 1.2 | หน้า `/login` render ครบ (ไม่มี error page) | Login form + ปุ่ม LINE + Google | ☐ | |
| 1.3 | Open DevTools → Console | ไม่มี error สีแดง | ☐ | |
| 1.4 | Vercel Logs มี request `/login` status 200 | ☐ | |

**⚠️ ถ้าเจอ 500 ที่ `/login`:** Login page ตอน Session 11 Round 2 พึ่งแก้ Suspense — เช็ค `src/app/(auth)/login/page.tsx` ว่า import `login-form.tsx` ถูกไหม

---

## Test 2 — LINE Login (5 นาที)

| # | ขั้น | Expected | Result | Note |
|---|------|----------|--------|------|
| 2.1 | คลิก "Login with LINE" | Redirect ไป `access.line.me/oauth2/...` | ☐ | |
| 2.2 | Login LINE (หรือยืนยัน) | Redirect กลับ `/api/auth/line/callback?code=...` | ☐ | |
| 2.3 | Callback สำเร็จ → redirect ไป `/dashboard` หรือ home | หน้าถัดไป render ได้ | ☐ | |
| 2.4 | User info ปรากฏ (ชื่อ/รูป LINE) | ☐ | |
| 2.5 | Vercel Logs: ไม่มี 4xx/5xx บน `/api/auth/line/*` | ☐ | |

**⚠️ ถ้าเจอ `redirect_uri_mismatch`:** กลับไปเช็ค LINE Login Channel `2009801571` → Callback URL ต้องมี `https://aim-expense-v2.vercel.app/api/auth/line/callback` เป๊ะๆ (ห้าม trailing slash)

---

## Test 3 — Google OAuth (Drive/Sheets connect) (5 นาที)

| # | ขั้น | Expected | Result | Note |
|---|------|----------|--------|------|
| 3.1 | ไปหน้า Settings → Connect Google | ปุ่มเชื่อม Google ใช้งานได้ | ☐ | |
| 3.2 | คลิก Connect → OAuth screen | Google consent screen ขึ้น | ☐ | |
| 3.3 | Allow permissions | Redirect กลับ `/api/auth/google/callback` | ☐ | |
| 3.4 | UI แสดง "Connected" | ☐ | |
| 3.5 | Token เก็บใน DB (check via UI หรือ Supabase studio) | ☐ | |

**⚠️ ถ้าเจอ `redirect_uri_mismatch`:** Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs ต้องมี `https://aim-expense-v2.vercel.app/api/auth/google/callback`

---

## Test 4 — LINE OA Receipt Upload (สำคัญสุด — 10 นาที)

| # | ขั้น | Expected | Result | Note |
|---|------|----------|--------|------|
| 4.1 | เข้า LINE → chat กับ `@064qycfu` | OA online | ☐ | |
| 4.2 | ส่งรูปใบเสร็จ 1 ใบ | OA อ่านรูปได้ | ☐ | |
| 4.3 | รอ Flex card ตอบกลับ | ภายใน **15 วินาที** (cold start อาจ ~10s) | ☐ | **จับเวลาจริง = ____ วิ** |
| 4.4 | Flex card แสดง: ยอดเงิน / ร้านค้า / วันที่ (จาก OCR) | ข้อมูลถูกต้องพอใช้ | ☐ | |
| 4.5 | กดปุ่ม "สร้างรายการ" บน Flex | เปิด URL deep-link กลับเว็บ (APP_BASE_URL) | ☐ | |
| 4.6 | Vercel Logs: `/api/line/webhook` POST status 200 | ☐ | |
| 4.7 | **Function duration**: ดู Vercel log ว่ากี่ ms | < 10000 ms (Hobby limit) | ☐ | **duration = ____ ms** |

**⚠️ ถ้า timeout (>15s):** เช็ค log — อาจต้อง optimize:
- Lazy import Prisma client
- ย้าย OCR ออกไป background job
- Switch DATABASE_URL เป็น Transaction Pooler (port 6543)

**⚠️ ถ้า Flex card ไม่ขึ้นเลย:** เช็ค LINE Messaging Channel `2009801545` → Webhook = Enabled + URL ถูก

---

## Test 5 — Create Payment on Web + Upload Receipt (5 นาที)

| # | ขั้น | Expected | Result | Note |
|---|------|----------|--------|------|
| 5.1 | `/payments` → คลิก "สร้างรายการจ่าย" | Modal ขึ้น | ☐ | |
| 5.2 | กรอก Payee / จำนวนเงิน / หมวด → บันทึก | Row ใหม่โผล่ใน list | ☐ | |
| 5.3 | คลิก payment → Upload receipt | Upload modal ขึ้น | ☐ | |
| 5.4 | Upload รูป → Save | Toast "สำเร็จ" | ☐ | |
| 5.5 | Receipt preview render ใน modal ถัดไป | Image โหลดจาก Drive URL | ☐ | |

---

## Test 6 — Verify Data Integrity (3 นาที)

| # | ขั้น | Expected | Result | Note |
|---|------|----------|--------|------|
| 6.1 | เปิด Google Sheet (prod) → tab `Payments` | Row ของ Test 5 มีอยู่ + ข้อมูลตรง | ☐ | |
| 6.2 | Column `Receipt URL` มี link Drive | Click link → preview รูปได้ | ☐ | |
| 6.3 | เปิด Drive → folder receipts/ | มีไฟล์รูปที่ upload | ☐ | |
| 6.4 | ลอง generate WHT cert / substitute receipt / receipt voucher | PDF save ใน Drive (folder ที่ตั้งไว้) | ☐ | |

---

## Test 7 — Vercel Logs Review (5 นาที)

- [ ] Vercel Dashboard → `aim-expense-v2` → **Logs** → Last 1 hour
- [ ] Filter: Status = 5xx — **Expected: ไม่มี**
- [ ] Filter: Status = 4xx — ตรวจว่าเป็น expected errors (401 ก่อน login, 404 favicon etc) ไม่ใช่ bug
- [ ] ดู **function duration** ของ LINE webhook — ถ้าใกล้ 10000ms บ่อย → flag ไว้
- [ ] ดู **cold start frequency** — ถ้าทุก invocation เย็น → consider warmup cron

---

## สรุปหลังเทส

| หัวข้อ | ผ่าน | ไม่ผ่าน | หมายเหตุ |
|--------|------|---------|-----------|
| Test 1 Login page | ☐ | ☐ | |
| Test 2 LINE Login | ☐ | ☐ | |
| Test 3 Google OAuth | ☐ | ☐ | |
| Test 4 LINE OA Receipt | ☐ | ☐ | |
| Test 5 Web Payment + Receipt | ☐ | ☐ | |
| Test 6 Data Integrity | ☐ | ☐ | |
| Test 7 Vercel Logs Review | ☐ | ☐ | |

**สถานะ Production:** ☐ พร้อมใช้งาน / ☐ มี bug ต้องแก้ก่อน / ☐ พร้อมแบบมี caveat

**Bugs ที่พบ** (list ไว้ให้เอมแก้ใน Session 12 ต่อไป):
1.
2.
3.

---

## Next Step หลัง Smoke Test ผ่าน

1. กลับมาคุยกับเอม พร้อมสรุปผล ✅/❌
2. ถ้าผ่านทุกข้อ → เริ่ม **Session 12A — Shared Components**
3. ถ้ามี bug → เอมจะแก้ทีละข้อก่อนเข้า Phase 4
4. ก่อน **2026-05-06** → อย่าลืม downgrade Vercel Pro trial → Hobby (ไม่งั้นโดน $20/เดือน)

---

*Checklist generated by Aim — Session 12 Kickoff*
