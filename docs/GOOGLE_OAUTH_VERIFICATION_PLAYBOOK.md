# 📘 Google OAuth Verification Playbook

> Knowhow สำหรับตั้งค่า Google OAuth ให้ระบบใหม่ **ผ่าน verification เร็วที่สุด** (หรือ
> ไม่ต้อง verify เลย) — สรุปจากประสบการณ์จริงของ Aim Expense (S28–S31, 2026-06)
>
> ใช้ได้กับทุกระบบที่ใช้ Google Sheets / Drive / Login (เช่น aim-hr)

---

## 🥇 กฎทองข้อเดียวที่สำคัญสุด

> **เลือก scope ให้ "แคบที่สุดเท่าที่งานต้องการ" — ถ้าใช้ได้แค่ non-sensitive scope จะ
> ไม่ต้องผ่าน Google verification เลย** (ไม่มี unverified warning, ไม่มี 100-user cap,
> ไม่ต้องส่ง demo video, ไม่ต้องรอ review เป็นสัปดาห์)

ความผิดพลาดที่แพงสุด = เริ่มด้วย sensitive scope (`spreadsheets`, `drive`) เพราะ "มันครอบคลุม
ดี" → ติดกับ verification ที่ Google มักปฏิเสธ. **Aim Expense เสียเวลาหลาย session กับเรื่องนี้
ก่อนยอมลดเป็น `drive.file`** ซึ่งทำงานได้เหมือนกันแต่ไม่ต้อง verify.

---

## 1. Scope tiers — รู้ก่อนเลือก

Google แบ่ง scope เป็น 3 ระดับ ผลต่อ verification ต่างกันมาก:

| Tier | ตัวอย่าง | ต้อง verify? | ผลถ้าไม่ verify |
|---|---|---|---|
| **Non-sensitive** | `userinfo.email`, `userinfo.profile`, `openid`, **`drive.file`** | ❌ ไม่ต้อง | publish ได้เลย ไม่มี warning ไม่มี cap |
| **Sensitive** | `spreadsheets`, `drive`, `gmail.readonly`, calendar | ✅ ต้อง | unverified warning + **cap 100 users** + ต้อง justify + demo video |
| **Restricted** | `gmail.modify`, `drive` (full), Gmail/Drive ทั้งหมด | ✅✅ ต้อง + security assessment | เหมือน sensitive + ต้องผ่าน **CASA security audit** (แพง, นาน, อาจต้องจ้าง 3rd party) |

**เป้าหมาย: อยู่ในแถว non-sensitive ให้ได้** → งานตั้งค่าจบใน 1 วัน ไม่ใช่ 1 เดือน

---

## 2. Decision tree — เลือก scope ยังไง

```
ต้องการอ่าน/เขียน Google Sheets หรือเก็บไฟล์ใน Drive?
│
├─ แอปสร้าง/จัดการ "เฉพาะไฟล์ของตัวเอง" (master sheet, โฟลเดอร์, ไฟล์อัปโหลด)?
│   └─ ✅ ใช้ drive.file (non-sensitive) — ครอบคลุมทั้ง Sheets API + Drive API
│       สำหรับไฟล์ที่แอปสร้าง → ไม่ต้อง verify  ◄◄◄ กรณีส่วนใหญ่อยู่ตรงนี้
│
├─ ต้องเข้าถึงไฟล์ "ที่ user มีอยู่แล้ว / สร้างนอกแอป"?
│   ├─ ให้ user เลือกไฟล์เองได้ไหม? → ✅ drive.file + Google Picker (setFileIds)
│   │     ยังเป็น non-sensitive! Picker = user grant ทีละไฟล์
│   └─ ต้องสแกน/ค้นทุกไฟล์อัตโนมัติ → ❌ จำเป็นต้อง drive (sensitive/restricted) → verify
│
└─ แค่ login? → userinfo.email + userinfo.profile + openid (non-sensitive)
```

---

## 3. `drive.file` — ตัวเอกที่คนเข้าใจผิดบ่อย

### ✅ ทำได้ (ที่หลายคนนึกว่าทำไม่ได้)
- **ใช้กับ Sheets API ได้เต็มที่** สำหรับไฟล์ที่แอปสร้าง: `spreadsheets.create`,
  `values.get/append/update`, `batchUpdate` — ครบ
- ใช้กับ Drive API: สร้างโฟลเดอร์, อัปโหลดไฟล์, `files.list` (เห็นเฉพาะไฟล์ของแอป)
- เก็บ `spreadsheetId` / `folderId` ไว้ใน DB แล้วเข้าถึงตรงได้ (ไม่ต้อง search)

### ❌ ข้อจำกัด (ต้องออกแบบรับมือ)
- เห็น **เฉพาะไฟล์ที่แอปสร้างเอง หรือ user เลือกผ่าน Google Picker** เท่านั้น
- ไฟล์ที่ "แอปไม่ได้สร้าง" → Sheets/Drive API คืน **`404 Requested entity was not found`**
  (ไม่ใช่ 403! drive.file ทำให้แอป "มองไม่เห็น" ไฟล์เลย เหมือนไม่มีอยู่)
- ไฟล์เก่าที่สร้างตอน token **ยังไม่มี** drive.file grant → เข้าไม่ได้ → ต้อง
  **Google Picker re-grant** (`setFileIds`) ให้ user ยืนยันครั้งเดียว

### ⚠️ Granular consent gotcha (สำคัญ — เจอจริงทุกแอป)
non-sensitive scope (รวม drive.file) แสดงเป็น **checkbox optional** บนหน้า consent —
user **ติ๊กเองได้ / ไม่ติ๊กก็ได้**. ถ้าไม่ติ๊ก:
- ได้ token ที่ valid แต่ **ขาด drive.file** → ทุก Sheets/Drive operation พังภายหลัง
- ตอน reconnect จะ **upsert ทับ connection ดีเดิมด้วย token ที่ขาด scope** → พังทั้งที่เคยใช้ได้

**Fix (บังคับทำทุกแอป):** ใน OAuth callback เช็ค granted scopes **ก่อน** persist token
```ts
const tokens = await exchangeCodeForTokens(code);
const granted = tokens.scope?.split(" ") ?? [];
if (!granted.includes("https://www.googleapis.com/auth/drive.file")) {
  // redirect กลับพร้อม error — อย่า upsert ทับ connection เดิม!
  return redirect("/connect?error=drive_not_granted");
}
// ...ค่อย encrypt + upsert
```
อ้างอิงจริง: `src/app/api/auth/google/callback/route.ts` (Aim Expense)

---

## 4. ตั้งค่า OAuth Consent Screen (Cloud Console) — checklist

`APIs & Services → OAuth consent screen`

- [ ] **User type:** External
- [ ] **App name** + **logo** (โลโก้ช่วยให้ดูน่าเชื่อถือ ลด rejection)
- [ ] **User support email**
- [ ] **App domain** — Application home page, Privacy policy URL, Terms of service URL
      (ทุก URL ต้อง **public + เข้าถึงได้จริง** ตอน Google เช็ค)
- [ ] **Authorized domains** — ใส่ domain หลัก (เช่น `aimexpense.com`)
- [ ] **Developer contact email**
- [ ] **Scopes** — เพิ่มเฉพาะที่ใช้จริง (ดู tier ข้อ 1)
- [ ] **Publishing status:**
      - non-sensitive only → กด **"Publish app"** ได้เลย (ไม่เข้า verification)
      - มี sensitive/restricted → จะเข้า verification flow อัตโนมัติ

`APIs & Services → Library` — เปิด API ที่ใช้:
- [ ] Google Sheets API
- [ ] Google Drive API
- [ ] Google Picker API (ถ้าใช้ Picker)

`APIs & Services → Credentials`:
- [ ] OAuth 2.0 Client ID (Web application)
- [ ] Authorized redirect URIs — ใส่ทั้ง prod + `http://localhost:PORT/...` สำหรับ dev

---

## 5. ถ้าจำเป็นต้องใช้ sensitive/restricted scope จริงๆ — requirements

(หลีกเลี่ยงถ้าทำได้ แต่ถ้าเลี่ยงไม่ได้ เตรียมให้ครบ Google จะ reject ถ้าขาด)

- [ ] **Homepage requirement** — landing page สาธารณะที่อธิบายว่าแอปทำอะไร, ใคร, ขอ data ทำไม
      (Google เคย reject Aim Expense เพราะ homepage ไม่ผ่าน → ต้องทำ public landing)
- [ ] **Privacy Policy** สาธารณะ + มี **Limited Use disclosure** (ดูข้อ 6)
- [ ] **Domain ownership verification** (Search Console)
- [ ] **Demo video** (YouTube) — แสดง OAuth flow + การใช้แต่ละ scope ชัดเจน
- [ ] **Scope justification** — อธิบายว่าทำไมต้องใช้แต่ละ scope, narrower scope ใช้แทนไม่ได้เพราะอะไร
- [ ] (restricted เท่านั้น) **CASA security assessment** — audit แพง+นาน

---

## 6. Limited Use disclosure (บังคับ ถ้าใช้ Google user data)

ต้องมีข้อความสาธารณะ (ในหน้า Privacy) ยืนยันว่าปฏิบัติตาม Google API Services User Data Policy
รวม Limited Use requirements. ตัวอย่างที่ Aim Expense ใช้ (deploy ที่ `/privacy`):

> Aim Expense's use and transfer of information received from Google APIs to any other app
> will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
> including the Limited Use requirements.

ใส่ URL นี้ใน consent screen + แจ้งทีม verification ตอน reply

---

## 7. Test project workflow (อย่าเทสต์ scope บน prod!)

ก่อนเปลี่ยน scope บน prod ที่มี user จริง — **เทสต์ใน GCP project แยกก่อนเสมอ:**

1. สร้าง GCP project ใหม่ ("...Test") + OAuth consent + OAuth client (redirect → localhost)
2. ตั้ง scope ใหม่ที่อยากเทสต์ (เช่น drive.file)
3. branch code แยก + ชี้ `.env.local` ไป test client + **DB แยก** (local Postgres — ไม่แตะ prod DB)
4. `npm run dev` → เทสต์ flow ครบ: consent → create sheet → read/write → upload → reports
5. เทสต์ negative case (ไฟล์ที่แอปไม่ได้สร้าง → ควร 404)
6. ผ่านแล้วค่อย merge → prod

> 💡 การเทสต์ scope ไม่ขึ้นกับ DB — DB เก็บแค่ metadata (spreadsheetId, folderIds).
> ใช้ DB เปล่าๆ ก็พอ ไม่ต้องเหมือน prod

---

## 8. Common rejections + วิธีแก้ (เจอจริงกับ Aim Expense)

| Google ปฏิเสธว่า | สาเหตุ | วิธีแก้ |
|---|---|---|
| Sensitive scope `spreadsheets` rejected, "use narrower scope" | scope กว้างเกินงาน | ลดเป็น `drive.file` → reply **"Confirming narrower scopes"** |
| Homepage requirement not met | ไม่มี public landing อธิบายแอป | ทำ public landing page |
| Limited Use disclosure missing | ไม่มีข้อความใน privacy | เพิ่ม disclosure (ข้อ 6) + ส่ง URL |
| "caller does not have permission" / 404 หลังลด scope | ไฟล์เก่าไม่ผูก drive.file grant | Google Picker re-grant (`setFileIds`) — หรือถ้าไม่มี data จริง ก็สร้างใหม่ |

### วิธี reply ทีม verification
ตอบใน **email thread เดิม** (มี case ID ผูก) หรือ Verification Center. ถ้ายอมลด scope:
> Confirming narrower scopes. We have updated our app to request only [drive.file ...] and no
> longer request [spreadsheets]. This is deployed. Our Limited Use disclosure is at [URL].

> ⚠️ Google มักเตือน "DO NOT remove previously approved scopes at this time" — อย่าเพิ่งลบ
> scope ออกจาก Console จนกว่าจะ reply confirm แล้ว Google จัดการให้ (app-side ขอแค่ scope ใหม่
> ได้เลย แต่ Console Data Access list ปล่อยไว้ก่อนจน Google บอกให้ลบ)

---

## 9. สรุป TL;DR สำหรับระบบใหม่

1. ✅ ออกแบบให้แอป "สร้าง/จัดการเฉพาะไฟล์ของตัวเอง" → ใช้ **`drive.file`** (non-sensitive)
2. ✅ Login ใช้ `userinfo.email` + `userinfo.profile` + `openid`
3. ✅ ตั้ง consent screen ครบ (homepage, privacy + Limited Use disclosure, ToS, domains)
4. ✅ non-sensitive only → **Publish ได้เลย ไม่ต้อง verify**
5. ✅ ใส่ **scope guard ใน callback** (กัน granular-consent ไม่ติ๊ก)
6. ✅ ต้องเข้าถึงไฟล์เก่า/นอกแอป → **Google Picker** (ยังคง non-sensitive)
7. ❌ อย่าเริ่มด้วย `spreadsheets`/`drive`/`gmail` ถ้าไม่จำเป็นจริงๆ

---

## 10. Reference

- [OAuth scopes (full list + tiers)](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Drive API scopes (drive.file vs drive)](https://developers.google.com/drive/api/guides/api-specific-auth)
- [Google Picker API](https://developers.google.com/picker/docs)
- [OAuth verification FAQ](https://support.google.com/cloud/answer/9110914)
- [API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- โค้ดอ้างอิงจริง (Aim Expense): `src/lib/google/oauth.ts`, `src/app/api/auth/google/callback/route.ts`,
  `src/server/services/google-sheets.service.ts`, `src/server/services/google-drive.service.ts`

---
*สรุปจาก Aim Expense drive.file migration (S28–S31, 2026-06). บทเรียนหลัก: เริ่มด้วย scope
ที่แคบที่สุดตั้งแต่แรก จะประหยัดเวลา verification ไปได้มหาศาล.*
