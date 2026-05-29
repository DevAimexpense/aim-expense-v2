# 🚨 Handoff — LINE bot บันทึกไม่ได้ + เตรียม Google verification

> **Created:** end of long session (S28/S29)
> **Prod HEAD:** `7f1af89` (main, deployed)
> **Status:** 🔴 **LINE บันทึกไม่ได้** ("The caller does not have permission") แม้หลัง revert scope + reconnect
> **บล็อค soft launch จริง** — ต้องแก้ #1 ก่อน

---

## 🔥 #1 BLOCKER — LINE ยังบันทึก Sheet ไม่ได้ (debug ต่อ)

### อาการ
- ส่งบิลในกลุ่ม LINE → บอทตอบ "ไม่สามารถบันทึกรายการได้ The caller does not have permission"
- เกิดหลัง: revert scope (`7f1af89`) + user reconnect Google เรียบร้อยแล้ว → ควรหายแต่ไม่หาย

### Hypothesis อันดับ 1 (ตรวจก่อน)
**LINE bot ใช้ token ของ "org owner" ไม่ใช่ของ "user ที่ reconnect"**
- `getSheetsService(orgId)` → master sheet ของ org ↔ ผูกกับ owner's Drive
- token ที่ใช้น่าจะเป็น `GoogleConnection` ของ owner (cross-check ใน code path)
- ถ้า owner ยังไม่ reconnect → token เก่ายังเป็น drive.file-only (ตอนเราลด scope) → permission denied

**Action:** หา org owner ของ org ที่ผูก LINE กลุ่ม + ให้ owner คนนั้น reconnect Google ที่ `/settings/google`

### Hypothesis อันดับ 2
- Vercel deploy ของ `7f1af89` ยังไม่ขึ้น / function cache เก่า → ตรวจใน Vercel dashboard ว่า build ล่าสุดจาก `7f1af89` จริง
- ลอง force redeploy

### Hypothesis อันดับ 3
- reconnect ที่ user ทำไป → consent dialog ไม่ได้ขึ้น scope `spreadsheets` (อาจ revoke ครึ่งทาง) → ตรวจ `GoogleConnection.scopes` ใน DB ดูว่ามี `auth/spreadsheets` ไหม

### Investigation script (รัน read-only)
```bash
cd "/Users/pimratraa./Code/Aim Expense V2/aim-expense" && node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  const orgs=await p.organization.findMany({select:{name:true,ownerId:true,owner:{select:{lineDisplayName:true,googleConnection:{select:{googleEmail:true,scopes:true,isActive:true,tokenExpiry:true,updatedAt:true}}}}}});
  console.log(JSON.stringify(orgs,null,2));
  await p.\$disconnect();
})().catch(e=>console.error(e.message));
"
```
ดูว่า owner ของแต่ละ org มี Google connection หรือไม่ + scopes มี `spreadsheets` หรือไม่ + tokenExpiry/updatedAt บอกอะไร

### ถ้า hypothesis 1 ถูก → fix
ให้ owner ทุกคน reconnect 1 ครั้ง. ทำได้ทันที (admin มี access /settings/google อยู่แล้ว — ไม่ต้องแก้โค้ดเพิ่ม)

---

## 🎯 #2 ภารกิจหลัก: ผ่าน Google verification → soft launch ได้โดยไม่ติด warning

### Context — ทำไมต้อง verify
แอปใช้ scope `.../auth/spreadsheets` (sensitive) → Google บังคับให้ verify ก่อนเปิดสาธารณะแบบไม่มี warning. **ไม่มีทางลัด** (ลองลดเหลือ `drive.file` แล้วพังตามข้างต้น)

### สถานะ Google Cloud Console ปัจจุบัน
- **OAuth consent screen:** Published / In production ✅
- **Audience:** External, user cap 100
- **Data Access → Sensitive scopes:** `.../auth/spreadsheets` (Approval required)
- **Restricted scopes:** ว่าง ✅
- **Justification:** กรอกแล้ว 881/1000 (ดูข้อความใน section ถัดไป)
- **banner "Your app requires verification"** — แสดงอยู่ → ต้อง submit

### Custom domain (จำเป็นก่อน submit verification)
Google verify `vercel.app` ไม่ได้ (public suffix). เอมมี `aimexpense.com` (เห็นจากอีเมล support@/dev@/dpo@/sales@aimexpense.com)

**Checklist:**
1. **Vercel → Settings → Domains** → เพิ่ม `app.aimexpense.com` (หรือใช้ apex `aimexpense.com`)
2. ตั้ง DNS record ตามที่ Vercel แจ้ง (CNAME หรือ A record)
3. รอ SSL provision (~1-10 นาที)
4. **Google Search Console** ([search.google.com/search-console](https://search.google.com/search-console)) → Add property → verify `aimexpense.com` ด้วย DNS TXT record
5. **Vercel → Environment Variables (Production)** → อัปเดต:
   - `NEXT_PUBLIC_APP_URL=https://app.aimexpense.com`
   - `GOOGLE_REDIRECT_URI=https://app.aimexpense.com/api/auth/google/callback`
   - `LINE_CALLBACK_URL=https://app.aimexpense.com/api/auth/line/callback`
   - **NEXT_PUBLIC_* ต้อง redeploy** หลังเปลี่ยน
6. **Google Cloud → APIs & Services → Credentials → OAuth 2.0 Client** → Authorized redirect URIs → เพิ่ม `https://app.aimexpense.com/api/auth/google/callback`
7. **LINE Developers Console → LINE Login channel → Callback URL** → เพิ่ม `https://app.aimexpense.com/api/auth/line/callback`
8. **Google Cloud → OAuth consent screen → Branding/Data Access:**
   - Authorized domain = `aimexpense.com`
   - App home page = `https://app.aimexpense.com`
   - Privacy = `https://app.aimexpense.com/privacy`
   - Terms = `https://app.aimexpense.com/terms`
   - App logo (จำเป็นสำหรับ verification — ใช้ logo Aim Expense, square, ≥120x120px)

### Justification ที่กรอกใน Console (881/1000 — ห้ามแก้ไปจากนี้เพราะ Google เห็นแล้ว)
```
Aim Expense is a SaaS for Thai SMEs to track expenses, billings, tax invoices, and accounting reports. During onboarding we create a master Google Sheet in the user's own Drive and use the spreadsheets scope to read/write financial data the user explicitly records via our web app and LINE chatbot — appending expense/payment/billing rows, updating statuses (approved/paid/cleared), and reading data back for dashboards and VAT/withholding-tax (ภ.พ.30/ภ.ง.ด.) reports.

The master sheet is also edited directly by users (manual rows, formula adjustments), so we need full Sheets API access; drive.file alone proved insufficient in production for accessing files after token refresh.

All data stays in the user's own Google Drive; we never store spreadsheet contents on our servers. Without this scope, users cannot save expenses, generate accounting reports, or use core features.
```

### Demo video script (~2 นาที, อัปขึ้น YouTube unlisted แล้วใส่ลิงก์ตอน submit)
**Scene 1 (0:00-0:20) — Brand + OAuth start**
- เปิด `https://app.aimexpense.com/login` → กดปุ่ม login ด้วย LINE → consent ผ่าน
- เปิดหน้า "เชื่อมต่อ Google" → กดปุ่ม Connect Google

**Scene 2 (0:20-0:45) — Consent screen ที่ขอ spreadsheets scope**
- หน้า Google consent screen → ขยายให้เห็นบรรทัด **"See, edit, create, and delete all your Google Sheets spreadsheets"** ชัดๆ
- กด Allow

**Scene 3 (0:45-1:20) — ใช้งานจริง: สร้าง expense**
- กลับมาที่แอป → เปิดหน้า `/expenses` → กดบันทึกค่าใช้จ่าย → เลือกโปรเจกต์ → ใส่จำนวนเงิน → บันทึก
- เปิด Google Sheet ของ user (master sheet) → ชี้ให้เห็น row ใหม่ใน tab Payments

**Scene 4 (1:20-1:50) — Read back สำหรับ report**
- เปิดหน้า `/reports` หรือ Dashboard → ชี้ให้เห็นยอดรวมที่อ่านกลับมาจาก sheet

**Scene 5 (1:50-2:00) — Voice-over/text overlay**
- "We use spreadsheets scope to read and write the master Google Sheet we created in the user's Drive. All data stays in the user's own Google account."

### Submit verification (Google Cloud → Verification Center)
1. รอ custom domain + env + scope ครบ
2. ไปที่ **Audience** → กด **"Go to verification center"**
3. กรอก:
   - ลิงก์ YouTube demo video
   - ยืนยัน privacy policy URL (app.aimexpense.com/privacy)
   - ยืนยัน scope justification (ที่กรอกไว้แล้ว)
4. Submit → Google review **~7-21 วันทำการ** สำหรับ sensitive tier
5. ระหว่างรอ: แอปใช้งานได้ปกติ (cap 100, แสดง warning)

---

## ✅ สิ่งที่ทำเสร็จแล้ววันนี้ (commit สำคัญ ตามลำดับ deploy)

| Commit | งาน |
|---|---|
| `36133ae` | Phase 1 entityType (บุคคล vs นิติบุคคล) |
| `2582a94` | ลบองค์กรได้ (owner-only) |
| `35e0ace` | รายรับ + แนบ 50ทวิ ฝั่ง personal |
| `ff93e37` | fix สลับ org ค้าง |
| `33fc813` | Dashboard P&L ใช้ข้อมูลจริง |
| `4fa996e` | fix maxEvents (go-live blocker) |
| `9108e80` | LINE กลุ่ม (binding + auto-save) |
| `6289962` | fix LINE บันทึกผิด org (persist activeOrgId) |
| `f6dda70` | LINE กลุ่ม เลือก project ตอนผูก |
| `a7a5401` | LINE 1-1 เลือกบริษัท (multi-org picker) |
| `23bc67a` + `91089a9` | fix bind page: filter status + openExternalBrowser |
| `360c5dd` | Project Manager role (Phase 1 — scoped reads) |
| `d73bdd1` | taxId → text (กัน Sheets แปลงเป็นเลข) |
| `e77a1cc` | /settings/google ให้ทุก member เข้าได้ |
| `78eaa8c` | /businesses/new gate Google connection |
| ~~`ee001c3`~~ | (ลด scope drive.file only — **revert แล้ว**) |
| `7f1af89` | **revert คืน auth/spreadsheets** (deploy ล่าสุด) |

---

## 🧨 บทเรียนสำคัญ (อย่าทำซ้ำ)

**สิ่งที่ผมพลาด:** แนะนำลด Google scope เหลือ `drive.file` only เพื่อเลี่ยง verification — Google docs บอกว่าน่าจะพอ แต่ใน production: **master sheet ที่สร้างไว้ก่อนหน้า เข้าถึงไม่ได้ด้วย drive.file token ใหม่** ("The caller does not have permission")

**กฎสำคัญสำหรับ session ถัดไป:**
- ห้ามแตะ Google OAuth scopes อีกถ้าไม่ได้ test กับ master sheet เดิมจริงๆ
- ห้ามลบ `auth/spreadsheets` ออก (เคยเจ็บแล้ว)
- การ verify คือทางเดียวจริงๆ ไม่มีลัด

---

## 🎬 First-message template สำหรับ session ใหม่
```
สวัสดีค่ะเอม — session ใหม่
📂 ~/Code/Aim Expense V2/aim-expense  ·  prod HEAD 7f1af89 (main, deployed)

🔴 อ่านก่อน: session29/handoff/HANDOFF_LINE_BROKEN_AND_VERIFICATION.md

🔥 ภารกิจด่วน:
1. แก้ LINE บอท "caller does not have permission" — เชื่อ hypothesis 1 (org owner ยัง
   ไม่ reconnect) → รัน investigation script ใน handoff → หา owner ที่ token ยังเป็น
   drive.file-only → ให้ reconnect

🎯 ภารกิจหลัก: เตรียม Google verification submission
- Custom domain (aimexpense.com → Vercel + Search Console)
- อัปเดต env Vercel + LINE/Google callbacks → app.aimexpense.com
- ถ่ายทำ demo video (script อยู่ใน handoff)
- กรอก privacy/terms/logo ใน consent screen
- Submit ที่ Verification Center

ทำ blocker ก่อน แล้วค่อย verification journey ค่ะ
```

---

*Handoff by Claude — end of long session. ขอโทษเรื่องลด scope ผิดพลาด — session ใหม่จะระวังกว่านี้ค่ะ 🙇*
