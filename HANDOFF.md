# Aim Expense V2 — Handoff Notes

## Last Updated: 2026-04-21 (Session 11 Round 1 — Phase 5 cleanup code-side เสร็จ)

---

## ✅ Session 11 Round 1 สรุป — Phase 5 Code Cleanup (2026-04-21)

**Scope:** เก็บกวาด dead code ของ Phase 5 (LINE Integration) ให้จบก่อนเริ่ม Phase 4 — ตามที่คุยกับพี่ก่อนเริ่ม session

**สิ่งที่แก้แล้ว (ผ่าน Edit tool):**
1. ✅ **แก้ middleware rate limit path bug** — `src/middleware.ts:17`
   - เดิม: `/api/webhook/line` (path เก่าที่ไม่ใช้แล้ว) → ทำให้ LINE webhook ปัจจุบันไม่มี rate limit ทำงานจริง
   - ใหม่: `/api/line/webhook` (path จริงที่ใช้งาน) → rate limit 300/min ทำงานถูกต้อง
2. ✅ **แก้ comment typo** — `src/server/services/google-sheets.service.ts:110`
   - เดิม: `"wth-cert" | "substitute-receipt" | "receipt-voucher"` (typo t-h ผิด)
   - ใหม่: `"wht-cert" | "substitute-receipt" | "receipt-voucher"` (ตรงกับ SystemDocType จริง)
3. ✅ **`npx tsc --noEmit`** — 0 errors

**🧹 รายการที่ต้องให้พี่ลบเองใน VS Code/Finder/Terminal (sandbox ลบไม่ได้):**
```bash
cd aim-expense
rm src/lib/ocr/pdf-to-png-server.ts
rm -rf src/app/api/webhook          # ทั้ง folder (ใน: line/route.ts — path เก่า)
rm -rf src/app/documents/wth-cert   # typo folder — document.tsx เหมือน wht-cert ทุก byte
```

**Impact หลังลบ:**
- ไม่มี dead route `/api/webhook/line` — LINE ต้องใช้ `/api/line/webhook` เท่านั้น
- ไม่มี dead page `/documents/wth-cert/*` — UI link ทั้งหมดชี้ `wht-cert` ถูกแล้ว (แก้ใน Session 10)
- Bundle เล็กลง ~5 KB, TypeScript compile เร็วขึ้นเล็กน้อย

**Phase 5 เหลืออีก 1 ข้อ (config ตอน deploy):**
- ตั้ง `APP_BASE_URL=https://<your-domain>` ใน env ของ Vercel/server
- ใช้ใน `src/lib/line/handlers.ts` (10 จุด) สำหรับ LINE deep-link กลับมาที่เว็บ
- Fallback chain: `APP_BASE_URL` → `NEXT_PUBLIC_APP_URL` → `http://localhost:3000`

**สถานะ Phase 5**: ✅ 95% (code เสร็จทั้งหมด, รอแค่ user ลบไฟล์ + ตั้ง env ตอน deploy)

---

## ✅ Session 10 สรุป — Phase 3 เสร็จ 100% แล้ว

**ปัญหาที่แก้ใน Session 10:**
1. Round 1 — Auto-save PDF silent fail → เพิ่ม Toast feedback + robust DOM waiting + verbose log
2. Round 2 — Strict Mode double-save → Module-level `Set` guard (client) + Server-side dedup (`GeneratedDocUrl` check)
3. Round 3 — **Folder spelling mismatch!** `wht-cert` (h-t, ถูก) vs `wth-cert` (t-h, ผิด) → สร้าง folder ใหม่ที่ถูก + แก้ 3 UI links + เพิ่ม retry getById + AutoFailMessenger

**Test ผ่านแล้ว ✓** (user confirm) — บันทึกใบหัก ณ ที่จ่าย / ใบรับรองแทน / ใบสำคัญรับเงิน ทั้ง 3 ประเภทได้อัตโนมัติเมื่อ save

**🧹 ข้อที่ user ควรเก็บกวาดเอง (sandbox ลบไม่ได้):**
- ลบ folder `src/app/documents/wth-cert/` (สะกดผิด t-h) — ตอนนี้ dead route ไม่ถูกเรียกแล้ว แต่รก

---

## 🚀 แผน Session 11 (ลำดับความสำคัญ)

**Phase 4 — Reports & Dashboard (ยังไม่เริ่ม) — งานหลักของ session นี้**
1. **Dashboard แยก role** (admin/manager/accountant/staff) — stat cards + quick actions
2. **Weekly Payment report** + Bank Sheet export
3. **รายงานเคลียร์งบ** (team expense reconciliation)
4. **ค้นหารายจ่าย** (advanced filter + Excel export)
5. **Inactive Payees** report
6. **Audit logs** UI (table + filter)

**Phase 5 cleanup** (ง่ายๆ):
- ตั้ง `APP_BASE_URL` ตอน deploy
- ลบไฟล์เก่า: `src/app/api/webhook/line/route.ts`, `src/lib/ocr/pdf-to-png-server.ts`
- ลบ folder `src/app/documents/wth-cert/` (สะกดผิด)

**Phase 6 — Billing & Launch** (งานใหญ่ — อาจต้องหลาย session):
- Stripe integration
- Subscription plans + credit system
- Landing page
- Migration tool
- Beta testing

---

---

## 🛠️ Session 10 Round 3 — Fix 404 ของ wth-cert iframe (2026-04-19)

**User log:**
```
PMT-MO5U1O81-KTUJ?auto=1  Failed to load resource: 404 (Not Found)
[auto-gen wht-cert PMT-MO5U1O81-KTUJ] iframe loaded
```

### Root cause — **Folder spelling mismatch!** 🎯
- Session ก่อน Round 9: folder เดิม = `src/app/documents/wth-cert/` (สะกดผิด: **t-h**)
- Session 10: `SystemDocType` ใน TypeScript = `"wht-cert"` (สะกดถูก: **h-t** — WHT = Withholding Tax)
- iframe src = `/documents/${docType}/...` = `/documents/wht-cert/...` (ถูก)
- แต่ Next.js route match folder ชื่อ `wht-cert` → **ไม่มี!** → 404
- substitute-receipt + receipt-voucher ไม่มี issue เพราะ folder + type ตรงกัน

### เหตุที่ Round 9 ไม่มีใครสังเกต
- fire-and-forget + ไม่มี toast feedback → 404 เงียบ → user ไม่รู้ว่าล้มเหลว
- user ต้องเปิดหน้าเอกสารเอง (ผ่าน UI link ที่ใช้ `wth-cert` ถูก match folder เดิม) แล้วกดบันทึกเอง → ตอนนั้นก็เลยดูเหมือน "ทำงาน"

### แก้ไข Round 3
**1. สร้าง folder ใหม่ถูก spelling `documents/wht-cert/`**
- `page.tsx` — Server component ใหม่ พร้อม:
  - **Retry getById 3 ครั้ง** (0/500/1500ms) รอ Google Sheets eventual consistency
  - **console.log** ทุก step สำหรับ debug ใน terminal
  - **Try/catch** ครอบการ query event/payee/org/getPayments()
  - **Fallback render** ถ้า payment not found → แสดง `<AutoFailMessenger>` ส่ง postMessage error กลับ parent (ไม่ redirect → iframe ไม่ timeout 90s)
- `document.tsx` — copy จาก folder เดิม (มี `runAutoSaveIfRequested` อยู่แล้ว)

**2. แก้ 3 UI links** (`wth-cert` → `wht-cert`)
- `src/app/(app)/documents/page.tsx` line 253
- `src/app/(app)/payments/page.tsx` line 319
- `src/app/(app)/expenses/page.tsx` line 381

**3. เพิ่ม Modal delay 800ms ก่อน fire iframe**
- `manual-receipt-modal.tsx` + `upload-receipt-modal.tsx`
- `setTimeout(() => fireAutoGenDoc(pid, dt), 800)` — รอ Sheets settle ก่อน iframe query

**4. เพิ่ม retry + AutoFailMessenger ให้ substitute-receipt + receipt-voucher** (defense-in-depth)

**5. สร้าง `src/lib/utils/auto-fail-messenger.tsx`**
- Client component — ตรวจ `?auto=1` → postMessage `{type:"doc-gen-result", success:false, error:"payment-not-found"}`
- Parent iframe ได้รับทันที → toast แสดง error → ไม่ต้องรอ 90s timeout

### หมายเหตุเกี่ยวกับ folder เดิม
- Folder `src/app/documents/wth-cert/` **ยังอยู่** (sandbox ลบไม่ได้ — permission denied)
- แต่ UI ไม่มี link point ไปอีกแล้ว → route เก่านั้นจะถูก dead route
- แนะนำให้พี่ **ลบ folder `wth-cert` (สะกดผิด) ออกจาก filesystem เอง** ใน VS Code/Finder หรือ IDE

### วิธีทดสอบ (Round 3)
```bash
cd aim-expense && npm run dev
# 1. /expenses → "ไม่มีใบเสร็จ" → สำเนาบัตร + WTH 3% → บันทึก
#    ✓ Modal ปิดทันที (delay 800ms ใน background)
#    ✓ Toast เด้ง "⏳ → 📸 → ☁️ → ✅"
#    ✓ Terminal log: [wht-cert/page] render paymentId=PMT-xxx
#    ✓ Drive: wht-cert PDF 1 ไฟล์
#
# 2. /expenses → กดปุ่ม "📄 หัก ณ ที่จ่าย" บนรายการ → เปิด /documents/wht-cert/{id}
#    ✓ render ได้ปกติ (ไม่ 404)
```

### ถ้ายังไม่บันทึก → ตรวจลำดับนี้
1. **Terminal (dev server)** — ต้องมี log `[wht-cert/page] render paymentId=...` — ถ้าไม่มี → iframe ไม่ request เข้า page เลย
2. **Console** — ดู log `[auto-save wht-cert PMT-xxx]` — ถ้า SKIP แปลว่า Strict Mode 2nd mount
3. **Network tab** — iframe request status — ถ้า 404 = folder match ผิด, 307 = redirect
4. **Toast error message** — ถ้า "payment-not-found" → Sheets retry ไม่เจอ → เพิ่ม delay ใน modal หรือ retry ใน page

---

## Last Updated: 2026-04-19 (Session 10 Round 2)

---

## 🛠️ Session 10 Round 2 — Fix double-save + wht-cert ไม่บันทึก (2026-04-19)

**User รายงาน (Round 1 test):**
- ✅ substitute-receipt: บันทึก — แต่ **2 ใบ** (duplicate)
- ❌ wht-cert: **ไม่บันทึก** เลย

### Root cause
1. **`reactStrictMode: true`** ใน next.config.mjs → `useEffect` ของ doc page รัน 2 ครั้งใน dev mode → auto-save เรียก 2 ครั้ง
   - substitute-receipt: render เร็ว → 2 ครั้ง success → **2 ไฟล์**
   - wht-cert: render ช้ากว่า (server page ต้อง query `sheets.getPayments()` + generate doc number) → ครั้งแรก capture ยังไม่เสร็จ cleanup → ครั้งที่ 2 overlap → race → **ไม่บันทึกทั้ง 2**
2. เดิม `runAutoSaveIfRequested` ไม่มี guard กัน concurrent call

### แก้ไข
**1. `src/lib/utils/save-doc-pdf.ts` — Client guard (Module-level)**
```ts
const __autoSaveStarted = new Set<string>();

// ใน runAutoSaveIfRequested():
const guardKey = `${docType}:${paymentId}`;
if (__autoSaveStarted.has(guardKey)) {
  console.log(`[auto-save ${guardKey}] SKIP — already started`);
  return;
}
__autoSaveStarted.add(guardKey);
```
- ใช้ **module-level Set** (ไม่ใช่ useRef) — persist ข้าม Strict Mode double-mount
- กันทั้ง dev double-run + user reload หน้าซ้ำใน window เดิม

**2. `src/app/api/documents/save-pdf/route.ts` — Server-side dedup**
```ts
if (payment.GeneratedDocUrl && payment.GeneratedDocType === docType) {
  console.log(`[save-pdf] DEDUP hit — return existing ${payment.GeneratedDocUrl}`);
  return NextResponse.json({
    success: true,
    fileUrl: payment.GeneratedDocUrl,
    fileName: "(existing)",
    folderPath: "",
    deduped: true,
  });
}
```
- Defense-in-depth: ถ้า client guard miss → server ยัง return existing แทน upload ซ้ำ
- ป้องกัน user กดปุ่มบันทึกเอง 2 ครั้งซ้ำด้วย (ก่อนหน้านี้จะได้ 2 ไฟล์)

### หลัก (Client + Server) ครอบคลุมเคสไหน
| เคส | Client guard | Server dedup |
|-----|-------------|-------------|
| Strict Mode double-mount | ✅ skip 2nd | (not reached) |
| User reload ?auto=1 ซ้ำ | ✅ skip 2nd | (not reached) |
| User กดบันทึกเอง 2 ครั้ง | ❌ (ไม่ผ่าน ?auto=1) | ✅ return existing |
| Race: 2 iframe พร้อมกัน | ⚠️ partial (guard local) | ✅ second call return existing |

### วิธีทดสอบ (Round 2)
ล้าง GeneratedDocUrl ของ payment ก่อน test (หรือสร้างใหม่):
```bash
# 1. สร้างรายการใหม่ทั้งหมด — ไม่ใช้ record เดิม
# 2. /expenses → "ไม่มีใบเสร็จ" → "สำเนาบัตร" + WTH 3% → บันทึก
#    ✓ Toast เด้ง "⏳ → 📸 → ☁️ → ✅"
#    ✓ Drive: ไฟล์ wht-cert 1 ใบ (ไม่ใช่ 2)
#    ✓ Console: ครั้งแรก `creating iframe` → ครั้งที่ 2 `SKIP — already started`
#
# 3. /expenses → "ไม่มีใบเสร็จ" → "ใบรับรองแทน" → บันทึก
#    ✓ Drive: substitute-receipt 1 ใบ
#
# 4. เปิด /documents/wht-cert/{paymentId} เอง (ไม่มี ?auto=1) → กดบันทึก 2 ครั้ง
#    ✓ ครั้งที่ 2: Server log `DEDUP hit — return existing`
#    ✓ ตอบ existing URL (ไม่ upload ซ้ำ)
```

### ถ้ายัง wht-cert ไม่ทำงาน (fallback plan)
- ตรวจ Console ว่ามี `[auto-save wht-cert PMT_xxx]` log ไหม
- ถ้าเห็น `SKIP` แต่ไม่เห็น result → client guard block แต่ iframe ครั้งก่อนไม่ complete → ต้อง cleanup guard เมื่อ error
- ถ้าไม่เห็น log เลย → iframe ไม่ load ถึง doc page (ดู Network tab iframe request)

---

## Last Updated: 2026-04-19 (Session 10 Round 1)

---

## 🛠️ Session 10 Round 1 — Fix Auto-save PDF (2026-04-19)

**User รายงาน:** "ตอนนี้ระบบยังไม่ auto save document ต้องกดบันทึกเอกสารเอง"

### สาเหตุที่เป็นไปได้ (Round 9 ที่ fail)
1. iframe trigger **silent fail** — fire-and-forget โดยไม่มี feedback ให้ user
2. รอแค่ 500ms ก่อน capture → Thai fonts + DOM paint **ยังไม่เสร็จ**
3. Timeout แค่ 30s → Thai font load + html2canvas + Drive upload อาจใช้เวลานานกว่านั้น
4. ไม่รอ iframe `load` event → setTimeout เริ่มจับเวลาทันทีที่ append

### แก้ไข Round 10
**1. `src/lib/utils/auto-gen-doc.ts` — Refactor ครบ**
- เพิ่ม `iframe.onload` event listener (log เมื่อ iframe โหลดเสร็จ)
- เพิ่ม `iframe.onerror` handler
- Default timeout **90s** (เพิ่มจาก 30s)
- เพิ่ม `onProgress` callback → UI สามารถ subscribe stages: `started → loaded → capturing → uploading → done/error`
- รับ `doc-gen-progress` message จาก iframe เพื่อ update progress
- **Toast notification** — แสดง bottom-right ของ user ขณะ auto-save
  - ⏳ "กำลังเตรียมเอกสาร" → 📸 "กำลังสร้าง PDF..." → ☁️ "กำลังอัปโหลดเข้า Google Drive..." → ✅ "บันทึกสำเร็จ" (มีลิงก์ไป Drive) / ⚠️ "บันทึกไม่สำเร็จ"
  - auto-dismiss หลัง 5s (success) / 8s (error)
  - ใช้ vanilla DOM — ไม่ pollute React tree
- Verbose logging ทุก step: `[auto-gen wht-cert PMT_xxx] creating iframe... loaded... received result: SUCCESS`

**2. `src/lib/utils/save-doc-pdf.ts` — Robust DOM waiting**
- เพิ่ม `waitForDomReady()` — รอ `document.fonts.ready` + 2 rAF + 200ms buffer
- เพิ่ม `waitForElement()` — รอ selector ปรากฏ + size > 0 (max 10s)
- เพิ่ม `onStage` callback → ส่ง `doc-gen-progress` message ให้ parent iframe
- เพิ่ม `runAutoSaveIfRequested()` helper — reusable สำหรับ 3 doc pages

**3. 3 document.tsx (wht-cert, substitute-receipt, receipt-voucher)**
- เปลี่ยนจาก inline setTimeout เป็น `runAutoSaveIfRequested()`
- Sync state ผ่าน `onStateChange` — update UI "✅ บันทึกแล้ว" หลัง auto-save เสร็จ
- ถ้าเข้าหน้าด้วย `?auto=1` + iframe → จะ postMessage กลับ parent

### Flow ใหม่
```
User กด "บันทึก" ใน modal
  ↓
modal: fireAutoGenDoc(paymentId, docType)
  ↓
💬 Toast เด้ง "⏳ กำลังบันทึก..."
  ↓
hidden iframe โหลด /documents/{type}/{id}?auto=1
  ↓
iframe: wait fonts.ready + 2 rAF + 200ms
  ↓
iframe → postMessage "doc-gen-progress: capturing"
  ↓ Toast: "📸 กำลังสร้าง PDF..."
iframe: html2canvas + jsPDF
  ↓
iframe → postMessage "doc-gen-progress: uploading"
  ↓ Toast: "☁️ กำลังอัปโหลด..."
iframe: POST /api/documents/save-pdf → Drive + Sheets
  ↓
iframe → postMessage "doc-gen-result: success + fileUrl"
  ↓ Toast: "✅ บันทึกสำเร็จ — เปิดใน Drive"
parent: remove iframe
```

### วิธีทดสอบ (Round 10)
```bash
cd aim-expense && npm run dev
# 1. /expenses → "ไม่มีใบเสร็จ" → สำเนาบัตร + WTH 3% → บันทึก
#    ✓ Modal ปิดทันที
#    ✓ Toast เด้งด้านล่างขวา "⏳ กำลังบันทึก wht-cert..."
#    ✓ Toast เปลี่ยน "📸 กำลังสร้าง PDF" → "☁️ อัปโหลด" → "✅ สำเร็จ"
#    ✓ กด link ใน toast → เปิดไฟล์ใน Drive ได้
#    ✓ Console: [auto-gen wht-cert PMT_xxx] creating iframe → loaded → SUCCESS
#
# 2. /expenses → "ไม่มีใบเสร็จ" → ใบรับรองแทน → ไม่มี WTH → บันทึก
#    ✓ Toast "substitute-receipt"
#
# 3. /expenses → "ไม่มีใบเสร็จ" → สำเนาบัตร + ไม่มี WTH → บันทึก
#    ✓ Toast "receipt-voucher"
#
# 4. /payment-prep → markPaid → auto-gen ของแต่ละ payment (loop)
```

### Debug tips
- ถ้า Toast ไม่ขึ้นเลย → `fireAutoGenDoc` ไม่ถูกเรียก → เช็ค Console log `[manual-save] trigger auto-gen ...`
- ถ้า Toast ค้างที่ "⏳ กำลังเตรียม" → iframe load ไม่เสร็จ → เช็ค Network tab + ดู path `/documents/wth-cert/{id}?auto=1`
- ถ้า Toast error → อ่านข้อความใน toast ตรงๆ (เช่น `timeout`, `iframe-load-error`, หรือ server error)

---

## Last Updated: 2026-04-17 (Session 9 → handoff to Session 10)

---

## สถานะโปรเจกต์ภาพรวม

| Phase | แผน | สถานะ |
|-------|------|-------|
| 1. Foundation (Week 1-2) | โครงสร้าง, Auth, Prisma, Google Services | ✅ เสร็จ 100% |
| 2. Core Data (Week 3-5) | Events/Payees/Banks/Assignments CRUD | ✅ เสร็จ 100% |
| 3. Payment System (Week 6-8) | Payment CRUD, Receipt upload, Approval, PDF | ✅ เสร็จ 100% |
| 4. Reports & Dashboard (Week 9-10) | Dashboard, Weekly Payment, Audit | ❌ ยังไม่เริ่ม |
| 5. LINE Integration (Week 11-12) | Webhook, OCR, Flex card | ✅ เสร็จ ~95% (Session 11) |
| 6. Billing & Launch (Week 13-14) | Stripe, Subscription, Landing page | ❌ ยังไม่เริ่ม |

---

## 🚀 แผน Session 10 (ลำดับความสำคัญ)

**A. ทดสอบ Round 8 (Auto-save PDF)** — เปิด dev server + ทดสอบ:
- เอกสารแต่ละประเภท → กด "💾 บันทึก PDF ลง Drive" → check file ใน Drive
- Check URL ใน Sheets column `GeneratedDocUrl`

**B. Phase 4 — Dashboard & Reports (ยังไม่เริ่ม)** — ลำดับย่อย:
1. **Dashboard แยก role** (admin/manager/accountant/staff) — stat cards + quick actions
2. **Weekly Payment report** + Bank Sheet export
3. **รายงานเคลียร์งบ** (team expense reconciliation)
4. **ค้นหารายจ่าย** (advanced filter + export Excel)
5. **Inactive Payees** report
6. **Audit logs** UI (table พร้อม filter)

**C. Phase 5 — LINE ส่วนที่เหลือ** (20% เหลือ):
- ตั้ง `APP_BASE_URL` ตอน deploy
- ลบไฟล์เก่า: `src/app/api/webhook/line/route.ts`, `src/lib/ocr/pdf-to-png-server.ts`

**D. Phase 6 — Billing & Launch** (งานใหญ่มาก):
- Stripe integration
- Subscription plans + credit system
- Landing page
- Migration tool
- Beta testing

---

## สิ่งที่ทำเสร็จแล้ว (ทุก Session รวม)

### Phase 1 — Foundation ✅
- Next.js 14.2 + tRPC + Prisma + Supabase setup
- Prisma schema: User, GoogleConnection, Organization, OrgMember, UserPermission, Subscription, AuditLog, LineDraft, Invitation
- Google OAuth (login → token → encrypt → cookie)
- JWT session via jose (cookie-based, 7 days)
- tRPC routers: event, payment, org, payee, bank, companyBank, subscription, user, eventAssignment
- GoogleSheetsService + GoogleDriveService (full CRUD)
- Sidebar + permission-based menu
- 21 pages สร้างไว้แล้ว (dashboard, events, payments, expenses, payees, banks, users, approvals, settings ฯลฯ)

### Phase 2 — Core Data CRUD ✅ (เสร็จ Session 7)
- **Events CRUD** ✅ — หน้า list + search + status filter + budget tracking (bar chart) + create/edit modal + delete (ป้องกันลบถ้ามี payments)
- **Payees CRUD** ✅ — หน้า list + search + create/edit modal (ชื่อ, Tax ID, สาขา, บัญชีธนาคาร, VAT, WHT, ที่อยู่, เบอร์โทร, อีเมล) + delete (ป้องกันลบถ้ามี payments)
- **Banks (Master List)** ✅ — หน้า list + search + เพิ่ม custom bank + ลบ custom (built-in protected) + 14 Thai banks seeded
- **Company Banks** ✅ — router + UI ใน settings/org (บัญชีบริษัท: ใบเสนอราคา/ใบวางบิล/Account Expense)
- **Event Assignments** ✅ — router (list/assign/remove/batchAssign) + Assignment Modal ในหน้า Events (ปุ่ม 👥)

### Phase 3 — Payment System ✅ ~95% (Session 1-7)
- OCR Pipeline: Akson Hybrid (Akson text extraction → GPT-4o JSON parse) — ทั้ง LINE + Web ใช้ตัวเดียวกัน
- Receipt upload modal (drag-drop, OCR auto-read)
- Manual receipt modal (ID card / substitute receipt)
- Invoice upload modal (with ID card support)
- Payment modal (manual entry)
- Searchable dropdowns ทั้งระบบ (13 ไฟล์)
- Expense type labels ภาษาไทย
- Attach receipt to paid payments
- **Approval Flow** ✅ — approve (single + batch), reject (with reason), markPaid (batchId), clearReconciliation (team expense), **initialStatus param** (pending=ตั้งเบิก ต้องอนุมัติ / paid=บันทึกค่าใช้จ่าย ข้ามอนุมัติ)
- **Approvals Page** ✅ — หน้ารออนุมัติ พร้อม filter + bulk selection + วันที่จ่าย modal
- **Payment Prep Page** ✅ — เตรียมจ่าย multi-tab (overview/summary/cash/per-bank) + Excel export
- **Document Generation** ✅ — WHT cert (ภ.ง.ด.) + ใบรับรองแทนใบเสร็จ (server-rendered)
- **Document Tracking Page** ✅ — หน้า /documents (3 tabs: รอใบเสร็จ / รอเคลียร์ / ครบแล้ว) พร้อม summary cards + filter + document links
- **Expense Update** ✅ — procedure `updateExpense` สำหรับ staff อัปเดตค่าใช้จ่ายจริง + "ActualExpense" column ใน Google Sheets
- **R5 Tax Compliance** ✅ — DocumentType, ExpenseNature, Category, VendorTaxIdSnapshot, VendorBranchInfo
- **R6 Ownership Gate** ✅ — CreatedByUserId + ownership-based edit permissions
- **ID Card OCR** ✅ — แก้ GPT prompt เฉพาะสำหรับ id_card (extract ชื่อ/เลขบัตร/ที่อยู่ ลง vendorName/vendorTaxId/vendorAddress)
- **Receipt Status Display** ✅ — ตาราง expenses + payments แยก 2 column: (1) "ใบเสร็จ" = ไฟล์จริงที่ upload (receiptUrl → invoiceFileUrl → documentType fallback) คลิก "✅ แนบแล้ว" เปิดดูไฟล์จริง, "📎 แนบ" สำหรับรายการ approved/paid/cleared ที่ยังไม่มี (2) "เอกสาร" = เอกสารที่ระบบออกให้ (📄 หัก ณ ที่จ่าย / 🧾 ใบรับรองแทน)
- **Amount Mismatch Warning** ✅ — แสดงกล่องแดงเด่นชัดใน UploadReceiptModal attach mode เมื่อ OCR อ่านยอดจากใบเสร็จ ≠ ยอดเบิก (logic ที่ compute อยู่ line ~163 + UI prominent display ด้านบน form)
- **Attach Receipt for Approved Items** ✅ — `recordReceipt` procedure รองรับ status "approved" + "paid" + "cleared" (ไม่มี ownership gate → ใครก็แนบไฟล์ได้ แต่แก้ยอดไม่ได้)
- **Attach Flow** ✅ — expenses page "📎 แนบ" → choice dialog → "มีใบเสร็จ" ใช้ UploadReceiptModal (recordReceipt ใน attach mode) / "ไม่มีใบเสร็จ" ใช้ ManualReceiptModal (recordReceipt ใน attach mode) — ทั้งคู่ไม่ผ่าน payment.update ownership gate
- **ID Card File Storage** ✅ — manual-receipt-modal เก็บไฟล์ ID card ไว้ใน state แล้ว upload ไป Google Drive ตอน save → receiptUrl ถูกเซ็ต → "✅ แนบแล้ว" ลิงก์ไปไฟล์จริง

### Phase 5 — LINE Integration ✅ ~80%
- LINE webhook endpoint (`/api/line/webhook`)
- Image/PDF → Akson OCR Hybrid → structured JSON (~7-11s)
- Quick Reply เลือกโปรเจกต์ (max 13 items)
- Flex card แสดงข้อมูลครบถ้วน: ยอด, ประเภทเอกสาร, เลขที่, วันที่, VAT/WHT, ผู้ขาย (ชื่อ/Tax ID/สาขา/ที่อยู่), ผู้ซื้อ, confidence
- 3 ปุ่ม: บันทึก / แก้ไขในเว็บ / ยกเลิก
- บันทึกลง Google Sheets + upload ไฟล์ไป Google Drive
- ลบ emoji ออกจากทุกข้อความ LINE แล้ว
- Error handling: ถ้า Flex fail → fallback เป็น text + Quick Reply
- Saved success Flex card

---

## 🤖 Session 9 Round 9 — Auto-save PDF อัตโนมัติทุกครั้ง (2026-04-17)

**User requirement:** ต้องการให้เอกสารทั้ง 3 รายการ **automatic save to drive ทุกครั้งที่สร้างเสร็จ** (ไม่ต้องกดปุ่ม)

### แนวทาง: Hidden iframe + postMessage (background)
1. สร้าง `/lib/utils/auto-gen-doc.ts` — helper `fireAutoGenDoc(paymentId, docType)`
2. helper สร้าง **hidden iframe** ชี้ไปที่ `/documents/{docType}/{id}?auto=1`
3. doc page ตรวจ `?auto=1` → useEffect trigger `handleSavePdf` อัตโนมัติ
4. doc page `postMessage` ผลกลับไปยัง parent window
5. helper ลบ iframe ออกจาก DOM เมื่อเสร็จ
6. ทั้งหมดทำ **fire-and-forget** — user ไม่ต้องรอ, modal ปิดทันที

### Triggers — จุดที่เรียก auto-gen
**1. Modal "ไม่มีใบเสร็จ" (manual-receipt-modal):**
- หลัง createPayment + upload idCard → trigger
- resolveDocType: WTH > 0 → wht-cert, substitute_receipt → substitute-receipt, id_card → receipt-voucher

**2. Modal "อัปโหลดใบเสร็จ" (upload-receipt-modal):**
- หลัง createPayment + upload receipt → trigger (ปกติจะได้ wth-cert เท่านั้น)

**3. หน้าเตรียมจ่าย (payment-prep) — markPaid:**
- หลัง markPaid สำเร็จ → loop selectedItems → trigger ทีละ payment

### Flow รอบเต็ม
```
User save modal → payment created (tRPC) → file upload → iframe created (background)
                                                       ↓
                                           iframe loads /documents/wth-cert/PMT_xxx?auto=1
                                                       ↓
                                           doc page mount → useEffect with ?auto=1
                                                       ↓
                                           handleSavePdf() → html2canvas + jsPDF
                                                       ↓
                                           POST /api/documents/save-pdf
                                                       ↓
                                           Drive upload + Sheets update
                                                       ↓
                                           postMessage → parent
                                                       ↓
                                           iframe removed from DOM
                                                       ↓
                                           ✓ done (silent — user ไม่รู้)
```

### ไฟล์ที่สร้าง/แก้ (Round 9)
**ใหม่:**
- 🆕 `src/lib/utils/auto-gen-doc.ts` — `resolveDocTypeForPayment()` + `triggerBackgroundDocGen()` + `fireAutoGenDoc()`

**แก้:**
- ✅ `src/app/documents/wth-cert/[paymentId]/document.tsx` — useEffect ตรวจ ?auto=1
- ✅ `src/app/documents/substitute-receipt/[paymentId]/document.tsx` — เหมือนกัน
- ✅ `src/app/documents/receipt-voucher/[paymentId]/document.tsx` — เหมือนกัน
- ✅ `src/app/(app)/expenses/manual-receipt-modal.tsx` — fire trigger หลัง save
- ✅ `src/app/(app)/expenses/upload-receipt-modal.tsx` — fire trigger หลัง save
- ✅ `src/app/(app)/payment-prep/page.tsx` — fire trigger หลัง markPaid (loop)

### วิธีทดสอบ
```bash
cd aim-expense && npm run dev
# เปิด DevTools → Console (จะเห็น log: [manual-save] trigger auto-gen wht-cert for PMT_...)
#
# 1. /expenses → ไม่มีใบเสร็จ → เลือก "สำเนาบัตร" + WTH 3% → บันทึก
#    → Modal ปิดทันที
#    → Console: "[manual-save] trigger auto-gen wht-cert for PMT_xxx"
#    → หลัง 3-5s: "[auto-gen] ✓ saved wht-cert for PMT_xxx: https://..."
#    → Google Drive → Documents/2026/04/ → เจอไฟล์ PDF
#    → Google Sheets → row → GeneratedDocUrl มี URL
#
# 2. /expenses → ไม่มีใบเสร็จ → เลือก "ใบรับรองแทน" → ไม่มี WTH → บันทึก
#    → auto-gen substitute-receipt
#
# 3. /expenses → ไม่มีใบเสร็จ → เลือก "สำเนาบัตร" + ไม่มี WTH → บันทึก
#    → auto-gen receipt-voucher
#
# 4. /payments → ตั้งเบิก → approve → payment-prep → markPaid
#    → auto-gen ตาม docType ของแต่ละ payment
```

### ข้อควรระวัง
- iframe ทำงาน **fire-and-forget** — ถ้า fail จะ log console warning (ไม่ block user)
- Timeout 30 วินาที per iframe — ถ้าเกินจะยกเลิก
- **สามารถกดปุ่ม 💾 ด้วยตัวเองได้** ถ้า auto-gen fail (ปุ่มยังอยู่)

---

## ✅ Session 9 Round 8 — Phase 3 เสร็จ 100% (Auto-save PDF) (2026-04-17)

**ทำ Phase 3 ที่เหลือ: Auto-generate + save PDF ลง Drive**

### แนวทาง: Client-side PDF generation + Server upload
- ใช้ `html2canvas` จับภาพ HTML element → canvas
- ใช้ `jsPDF` สร้าง PDF จาก canvas (A4 portrait)
- Post ไป `/api/documents/save-pdf` → อัปโหลดเข้า Drive
- ✅ ไม่ต้องใช้ puppeteer (หนัก 300MB+) — เบากว่ามาก

### Drive Structure (เอกสารระบบออก)
```
Aim Expense — {org}/
└── Documents/
    ├── 2026/
    │   ├── 04/
    │   │   ├── 20260417_wth-cert_ค่าบริการ_PMT_xxxxx.pdf
    │   │   ├── 20260417_substitute-receipt_ค่าอาหาร_PMT_yyyyy.pdf
    │   │   └── 20260417_receipt-voucher_Internet_PMT_zzzzz.pdf
    │   └── 05/
    └── 2025/
```

### Filename Convention
`{YYYYMMDD}_{docType}_{description}_{paymentId}.pdf`
- docType = `wht-cert` / `substitute-receipt` / `receipt-voucher`

### UI Flow
1. User เปิดหน้าเอกสาร (WHT cert / ใบรับรองแทน / ใบสำคัญรับเงิน)
2. เห็นปุ่ม 3 ปุ่ม: "← กลับ" / "🖨️ พิมพ์" / **"💾 บันทึก PDF ลง Drive"**
3. Click → Status เปลี่ยนเป็น "⏳ กำลังบันทึก..."
4. สำเร็จ → ปุ่มเปลี่ยนเป็น **"✅ บันทึกแล้ว — ดูใน Drive"** (link)
5. ผิดพลาด → แสดง error box มุมขวาบน

### Sheets Changes
เพิ่ม 2 columns ใน PAYMENTS:
- `GeneratedDocUrl` — URL ของ PDF ใน Drive
- `GeneratedDocType` — "wht-cert" / "substitute-receipt" / "receipt-voucher"

### ไฟล์ที่สร้าง/แก้ (Round 8)
**ใหม่:**
- 🆕 `src/lib/utils/save-doc-pdf.ts` — client helper (html2canvas + jsPDF + fetch)
- 🆕 `src/app/api/documents/save-pdf/route.ts` — endpoint upload → Drive → update Sheets

**แก้:**
- ✅ `src/server/services/google-sheets.service.ts` — เพิ่ม column GeneratedDocUrl/Type
- ✅ `src/server/services/google-drive.service.ts` — เพิ่ม `uploadSystemDocument()` method
- ✅ `src/server/routers/payment.router.ts` — toPaymentRow map field ใหม่
- ✅ 3 document components (wht-cert, substitute-receipt, receipt-voucher) — เพิ่มปุ่ม save

**npm install:** `html2canvas` + `jspdf`

### Note: Thai Font
- `html2canvas` capture เป็นภาพ → Thai fonts render ตรงตาม CSS (`IBM Plex Sans Thai`, `Sarabun`)
- ไม่ต้อง embed fonts ใน jsPDF (เพราะใช้ canvas เป็นภาพ)
- PDF ที่ได้ = ภาพของเอกสาร (ดีสุดสำหรับ Thai, quality ขึ้นกับ `scale: 2`)

---

## 📄 Session 9 Round 7 — ปรับฟอร์มเอกสารทั้ง 3 ตามตัวอย่างจริง (2026-04-17)

User ส่ง PDF ตัวอย่าง 3 ไฟล์ — ปรับ HTML ให้ match:
- `approve_wh3_081156.pdf` — หนังสือรับรองหัก ณ ที่จ่าย (ฟอร์มกรมสรรพากร)
- `ใบรับรองแทนใบเสร็จรับเงิน20260417.pdf`
- `ใบสำคัญรับเงิน_20260417.pdf`

### 1. 📄 หนังสือรับรองการหักภาษี ณ ที่จ่าย — ปรับ Major rewrite
**ตาม requirement พี่:**
- ✅ **เล่มที่** = ปี ค.ศ. ของวันที่ออกเอกสาร (เช่น 2026)
- ✅ **เลขที่** = MMDD/SEQ เช่น `0224/003` — SEQ = ลำดับที่เอกสาร WHT ในเดือนนั้น
- ✅ **ผู้มีหน้าที่หัก** = องค์กร (org)
- ✅ **ผู้ถูกหัก** = ผู้ขาย (payee)
- ✅ **ภ.ง.ด.3** = บุคคลธรรมดา (TaxID ขึ้นต้นไม่ใช่ "0") ติ๊กอัตโนมัติ
- ✅ **ภ.ง.ด.53** = นิติบุคคล (TaxID ขึ้นต้น "0") ติ๊กอัตโนมัติ
- ✅ **ประเภทรายได้** map จาก WHT type:
  - commission-3 → section 2 (ค่าธรรมเนียม ค่านายหน้า 40(2))
  - service-1/3, contract-3, transport-1, ad-2, rental-5, show-5 → section 5 (คำสั่ง 3 เตรส)
  - professional-5, custom → section 6 (อื่น ๆ)
- ✅ **ผู้จ่ายเงิน** ติ๊ก **(1) หัก ณ ที่จ่าย** อัตโนมัติ
- ✅ **Layout** ครบตามตัวอย่าง: ฉบับที่ 1/2, tax boxes 13 ช่อง, section 6 ประเภท + รวม, ตัวอักษร, กองทุน, คำเตือน, ตราประทับ

**ไฟล์ที่สร้าง/แก้:**
- 🆕 `src/lib/wht-doc-utils.ts` — utilities: generateWhtDocNumber, getPndForm, mapWhtToIncomeSection
- ✅ `src/app/documents/wth-cert/[paymentId]/page.tsx` — query month payments + generate doc number
- ✅ `src/app/documents/wth-cert/[paymentId]/document.tsx` — rewrite ทั้งไฟล์ตาม layout PDF

### 2. 🧾 ใบรับรองแทนใบเสร็จรับเงิน — ปรับใหม่
**ตาม PDF ตัวอย่าง:**
- Title กลางหน้า
- `บจ. / หจก.` → company name + (ผู้ซื้อ/ผู้รับบริการ)
- Table 4 คอลัมน์: วัน เดือน ปี / รายละเอียดรายจ่าย / จำนวนเงิน / หมายเหตุ
- แถวว่าง 11 แถวให้พอสำหรับ print
- รวมทั้งสิ้น + (ศูนย์บาทถ้วน)
- Declaration: "ข้าพเจ้า ... (ผู้เบิกจ่าย) ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในงานของทาง **[org]** โดยแท้ ตั้งแต่วันที่ ... ถึงวันที่ ..."
- ลงชื่อ (ผู้เบิกจ่าย) + (ผู้อนุมัติ)

**ไฟล์:** `src/app/documents/substitute-receipt/[paymentId]/document.tsx` (rewrite)

### 3. 🧾 ใบสำคัญรับเงิน — ปรับใหม่
**ตาม PDF ตัวอย่าง:**
- Title กลางหน้า + เลขที่/วันที่ มุมบนขวา
- `ข้าพเจ้า [payee.name]` (ผู้ขายสินค้า/ให้บริการ)
- `เลขประจำตัวผู้เสียภาษี` + `อยู่ที่บ้านเลขที่`
- `ได้รับเงินจาก [org.name]` (ผู้ซื้อ/ผู้รับบริการ) ดังรายการต่อไปนี้
- Table 2 คอลัมน์: รายการ / จำนวนเงิน (แถวว่าง 13 แถว)
- (ตัวอักษร) + รวมเป็นเงิน (บาท)
- ลงชื่อ ผู้รับเงิน + ผู้จ่ายเงิน
- หมายเหตุ (สีแดง): แนบสำเนาบัตรประจำตัวประชาชนผู้รับเงิน

**ไฟล์:** `src/app/documents/receipt-voucher/[paymentId]/document.tsx` (rewrite)

### คำสั่งทดสอบ (Round 7)

```bash
cd aim-expense && npm run dev

# Test WHT cert (หัก ณ ที่จ่าย)
# 1. สร้างรายจ่ายที่มีหัก ณ ที่จ่าย เช่น ค่าบริการ 3%, payee = บุคคล
#    → เปิด /documents/wth-cert/{paymentId}
#    → เช็ค: เล่มที่ = 2026, เลขที่ = 0417/001 (ถ้าเป็น WHT แรกของเม.ย.)
#    → ติ๊ก ภ.ง.ด.3 (เพราะ payee taxId ไม่ขึ้นต้น 0)
#    → Section 5 (3 เตรส) มียอดจ่าย + ภาษีที่หัก
#    → ติ๊ก (1) หัก ณ ที่จ่าย

# 2. สร้างรายจ่าย payee = บริษัท (taxId ขึ้นต้น 0)
#    → ติ๊ก ภ.ง.ด.53 แทน

# Test ใบรับรองแทน + ใบสำคัญรับเงิน
# 3. /expenses → ไม่มีใบเสร็จ → เลือก "ใบรับรองแทนใบเสร็จรับเงิน" → บันทึก
#    → ดู /documents/substitute-receipt/{id} → เทียบกับตัวอย่าง PDF
# 4. /expenses → ไม่มีใบเสร็จ → เลือก "สำเนาบัตรประชาชน" + ไม่มี WTH → บันทึก
#    → ดู /documents/receipt-voucher/{id} → เทียบกับตัวอย่าง PDF
```

---

## 🎯 Session 9 Round 6 — FIX ROOT CAUSE + เอกสารระบบ logic ถูกต้อง (2026-04-17)

### 1. 🐛 Root cause ของ "Cannot read properties of undefined (reading 'from')" — ✅ แก้แล้ว
**ที่มา:** `google-drive.service.ts` → `uploadFile()` ใช้ **dynamic import**:
```ts
const { Readable } = await import("stream");  // ← บางครั้ง return undefined
body: Readable.from(fileBuffer)  // → throws "reading 'from'"
```

**แก้:** เปลี่ยนเป็น **static import** ด้านบนไฟล์:
```ts
import { Readable } from "stream";  // ← แก้ที่นี่
```

นี่คือสาเหตุที่ modal "ไม่มีใบเสร็จ" บันทึกไม่ได้ และ error เด้งพร้อมข้อความ "reading 'from'" ค่ะ

### 2. 📎 field "ใบเสร็จ" แสดง "แนบแล้ว" = ไฟล์จริงเท่านั้น
ก่อนหน้านี้ผมแสดง "แนบแล้ว" สำหรับทุก documentType ซึ่ง**ผิด** user requirement
**แก้ใหม่ตรงตามที่พี่สั่ง:**
- มี `receiptUrl` (ไฟล์ upload ใน Drive) → ✅ **แนบแล้ว** → คลิกเปิดไฟล์จริง
- มี `invoiceFileUrl` → ✅ **แนบแล้ว** → คลิกเปิดไฟล์จริง
- ไม่มีไฟล์ + status อนุญาต → 📎 **แนบ** → เปิด choice modal
- Status ไม่อนุญาต → —

### 3. 📋 เอกสารระบบออก (เอกสาร column) — Mutually Exclusive
**Rule:**
| เงื่อนไข | เอกสารที่ออก | หน้า |
|---------|--------------|------|
| WTH > 0 | 📄 **หัก ณ ที่จ่าย** | `/documents/wth-cert/{id}` |
| documentType = substitute_receipt + no WTH | 🧾 **ใบรับรองแทนใบเสร็จ** | `/documents/substitute-receipt/{id}` |
| documentType = id_card + no WTH | 🧾 **ใบสำคัญรับเงิน** (ใหม่) | `/documents/receipt-voucher/{id}` |
| อื่นๆ | — | — |

**หมายเหตุ:** ถ้ามี WTH → ออก WHT cert เท่านั้น ไม่ออกซ้ำกับใบรับรองแทน/ใบสำคัญรับเงิน

### 4. 🆕 หน้าใหม่: ใบสำคัญรับเงิน (Receipt Voucher)
- `/documents/receipt-voucher/[paymentId]/page.tsx`
- `/documents/receipt-voucher/[paymentId]/document.tsx`
- รูปแบบ: ผู้จ่าย (บริษัท) / ผู้รับเงิน (payee) / ตาราง / จำนวนเงิน / ลายเซ็น 2 ช่อง
- ใช้สำหรับกรณี: payee เป็นบุคคล + ไม่มีการหัก ณ ที่จ่าย (เช่น ค่าซ่อมอินเทอร์เน็ต)

### 📁 ไฟล์ที่แก้/สร้าง (Round 6)
- `src/server/services/google-drive.service.ts` — ✅ static import `Readable` (fix root cause)
- `src/app/(app)/expenses/page.tsx` — ใบเสร็จ column + เอกสาร column logic ใหม่
- 🆕 `src/app/documents/receipt-voucher/[paymentId]/page.tsx`
- 🆕 `src/app/documents/receipt-voucher/[paymentId]/document.tsx`

---

## 🔧 Session 9 Round 5 — แก้ field "ใบเสร็จ" ให้แสดง "แนบแล้ว" ตาม requirement (2026-04-17)

**User requirement ชัดเจน:**
> รายการเบิกที่แนบเอกสารแล้ว field ใบเสร็จ ให้แสดง **"แนบแล้ว"** — กดเข้าไปให้เจอใบเสร็จที่แนบไว้

**ที่ Round 4 ผมทำผิด:** แยกเป็น "แนบสำเนาบัตร" สำหรับ id_card ซึ่งไม่ตรง requirement

**แก้แล้ว:** unified logic — ทุก record ที่มี documentation แสดง **"✅ แนบแล้ว"** คลิกเปิดเอกสารได้เสมอ
- Priority: `receiptUrl` → `invoiceFileUrl` → `/documents/substitute-receipt/{id}` (fallback สำหรับ id_card/substitute_receipt)
- ถ้าไม่มี documentation ทั้ง 3 อย่าง → "📎 แนบ" button
- ถ้า status ไม่อนุญาต attach → "—"

---

## 🔧 Session 9 Round 4 — Follow-up fixes (2026-04-17)

### 1. Error "Cannot read properties of undefined (reading 'from')" — เพิ่ม diagnostic
ยังสอบสวน root cause ไม่เจอ (ตรวจ client code ทั้งหมดไม่พบ `.from()` บน undefined) จึง **เพิ่ม step-by-step logging** ใน `manual-receipt-modal.handleSave`:
- ทุกขั้นตอนมีชื่อ step: `prepare` → `createPayee` (optional) → `createPayment` หรือ `uploadReceipt`/`recordReceipt` (attach mode) → `uploadIdCard` → `closeModal`
- Error message ใน modal จะแสดง step ที่ fail เช่น `[createPayment] Cannot read properties of undefined (reading 'from')`
- Console log ทั้งก่อน/หลัง + ตอน FAILED → เปิด DevTools → Console ดู stack trace ได้

**วิธี repro แล้วส่ง info ให้เอม:**
1. เปิด DevTools (F12) → Console tab
2. Reproduce error
3. copy stack trace + step ที่แสดง → ส่งมา จะ pinpoint ได้แม่น

### 2. Field ใบเสร็จ (expenses/page.tsx) — UX ใหม่
- ✅ `receiptUrl` → "✅ แนบแล้ว" (link เปิดไฟล์จาก Drive)
- ✅ `invoiceFileUrl` → "✅ แนบแล้ว" (link เปิดใบแจ้งหนี้)
- ✅ `documentType="substitute_receipt"` → **"✅ แนบแล้ว"** (link เปิด HTML page `/documents/substitute-receipt/{id}`) — ระบบ render เอง ไม่ต้อง upload
- ⚠️ `documentType="id_card"` แต่ไม่มีไฟล์ → "📎 แนบสำเนาบัตร" (button แนบไฟล์เพิ่ม) — เพราะ id_card ต้องมี file จริง
- ⚠️ รายการที่ `canAttachReceipt` แต่ยังไม่มี document → "📎 แนบ" (button เปิด modal เลือก)

### 3. ตอบคำถาม database / unique key
- ❌ **ไม่ต้อง reset database** หรือ migrate อะไร
- ✅ `PaymentID` เป็น unique key อยู่แล้วตั้งแต่แรก — เก็บใน Google Sheets column `PaymentID`
  - รูปแบบ: `PMT_{timestamp}_{random}` เช่น `PMT_1729185900000_AB3C`
  - สร้างโดย `GoogleSheetsService.generateId("PMT")` ตอน create payment
- รายการเก่า = มี PaymentID อยู่แล้ว ไม่ต้องแก้ไข

---

## 🗂️ Session 9 Round 3 — Folder Structure + Filename Convention (2026-04-17)

### ปัญหาที่ user รายงาน
1. Folder structure ปัจจุบัน flat: `Receipts/{orgName}_YYYY_MM/` — อยากให้แยก Year/Month ซ้อน
2. ชื่อไฟล์ไม่มี date prefix + ไม่มี paymentId → ถ้า URL ใน Sheets หาย ค้นไฟล์กลับมาไม่ได้
3. สงสัยว่าไม่มีการ save file จริง

### สิ่งที่ตรวจเจอ
- **Unique key:** มีอยู่แล้วตั้งแต่แรก — `PaymentID` column สร้างโดย `GoogleSheetsService.generateId("PMT")` → รูปแบบ `PMT_{timestamp}_{random}` เช่น `PMT_1729185900000_AB3C`
- **Save logic:** มีอยู่ผ่าน `/api/payments/upload` → `drive.uploadPaymentFile` (ทำงานจริง) แต่ filename/folder ยังไม่ตรง requirement
- **เคส "ไม่มีการ save":** ถ้ารายการเป็น `substitute_receipt` (ใบรับรองแทนใบเสร็จ — ไม่มีใบเสร็จ) จะไม่มี file ให้ upload เพราะเป็น system-generated doc (render HTML ที่ `/documents/substitute-receipt/{paymentId}`) — **ยังไม่ได้ auto-save เป็น PDF ไว้ใน Drive** (feature ที่ต้องเพิ่มภายหลัง)

### การแก้ไข

**1. Folder Structure ใหม่** (`google-drive.service.ts`)
```
Aim Expense — {orgName}/
└── Receipts/
    ├── 2026/
    │   ├── 04/   ← วันที่บนเอกสาร (receiptDate) 14 เม.ย. 2026
    │   ├── 05/
    │   └── ...
    ├── 2025/
    │   └── 12/
    └── ...
```
- เพิ่ม `getOrCreateYearMonthFolder(receiptsFolderId, year, month)` — สร้าง `Receipts/{YYYY}/{MM}/` แบบ nested
- ถ้ามีอยู่แล้ว → reuse, ถ้ายังไม่มี → สร้างใหม่

**2. Filename Convention ใหม่** (`google-drive.service.ts`)
- รูปแบบ: `{YYYYMMDD}_{description}_{paymentId}.{ext}`
- ตัวอย่าง: `20260414_ค่าอาหาร_PMT_1729185900000_AB3C.pdf`
- `paymentId` embed ในชื่อไฟล์ → **ถ้า URL ใน Sheets หาย ยังหาไฟล์กลับได้จาก filename**
- sanitize description: เก็บได้ทั้งไทย/อังกฤษ/ตัวเลข/_/- (ตัด char พิเศษ)

**3. `uploadPaymentFile()` signature ใหม่**
```ts
{
  receiptsFolderId, orgName,
  receiptDate,    // ✨ NEW: วันที่ใบเสร็จ/ใบกำกับ (ใช้จัด folder + prefix)
  paymentId,      // ✨ NEW: unique key (ใส่ในชื่อไฟล์)
  description,    // ✨ NEW: รายละเอียด (ใส่ในชื่อไฟล์)
  projectName, payeeName, invoiceNumber,
  fileType, fileName, mimeType, fileBuffer,
}
```
- Response: เพิ่ม `folderPath` ให้ debug ง่าย เช่น `Receipts/2026/04`

**4. `/api/payments/upload`**
- รับ 2 field ใหม่: `receiptDate` + `description`
- Fallback chain: clientReceiptDate → payment.ReceiptDate → payment.DueDate → today
- Sync `ReceiptDate` + `ReceiptNumber` ใน Sheets ด้วย ถ้า client ส่งมา
- เพิ่ม `console.log` ทั้งก่อน/หลัง upload → ดู server log ได้ว่า upload ไปไหน
- Audit log summary แสดง folderPath

**5. Client-side callers ส่ง `receiptDate` + `description` ทั้งหมด**
- `upload-receipt-modal.tsx` (attach + create): ใช้ `form.documentDate` + `form.description`
- `manual-receipt-modal.tsx` (attach + create): ใช้ `form.documentDate` + `form.description || form.vendorName`
- `payments/receipt-upload.tsx`: ใช้ state `receiptDate`
- `payments/upload-invoice-modal.tsx`: ใช้ `form.dueDate` + `form.description` (invoice ยังไม่มี receiptDate)
- `lib/line/handlers.ts`: generate `paymentId` ก่อน upload → embed ในชื่อไฟล์ได้

### วิธีตรวจว่า upload ทำงานจริง
```bash
# 1. รัน dev server
cd aim-expense && npm run dev

# 2. เปิด terminal ที่รัน server → ดู log
#    จะเห็นข้อความเช่น:
#    [upload] paymentId=PMT_... fileType=receipt size=...
#    [drive] uploading to Receipts/2026/04/20260414_ค่าอาหาร_PMT_....pdf
#    [drive] uploaded → https://drive.google.com/...

# 3. เปิด Google Drive → เข้า folder "Aim Expense — {orgName}" → Receipts → 2026 → 04
#    ไฟล์จะอยู่ที่นั่น

# 4. Verify filename: "20260414_ค่าอาหาร_PMT_XXXXX.pdf"
```

### ข้อควรรู้
- **รายการเก่า** ที่อัปโหลดก่อนหน้า — folder/filename เดิมยังอยู่ ไม่ได้ย้าย (ใช้ URL เดิมเปิดได้ปกติ)
- **รายการใหม่** ทั้งหมด จะใช้ structure + filename ใหม่
- **substitute_receipt** (ไม่มีใบเสร็จ) — ยังไม่มีการ auto-generate PDF ลง Drive → feature นี้ต้องเพิ่มใน session ถัดไป

---

## 🔄 Session 9 Round 2 — แก้ follow-up bugs (2026-04-17)

### 1. useEffect overwrite bug (manual-receipt-modal) ✅
- **อาการ:** ใน attach mode เมื่อ modal เปิด ถ้ายังไม่มีการกรอก subtotal, useEffect auto-calc VAT จะ overwrite ค่า totalAmount/vatAmount เดิมจาก payment เป็น 0
- **Fix:** initialize `subtotal` จาก gttlAmount - vatAmount + เพิ่มเงื่อนไข `form.subtotal > 0` ใน useEffect

### 2. Modal ปิดช้า 5 วินาที ✅
- **อาการ:** หลังกดบันทึก modal ใช้เวลา ~5s ถึงจะปิด เพราะรอ file upload + invalidate ก่อน → user อาจกด save ซ้ำ
- **Fix:**
  - เพิ่ม local `saving` state → button disabled ตลอด flow (รวมช่วง fetch upload ที่ mutation state เป็น false)
  - เปลี่ยนลำดับ: `onSuccess()` ก่อน → `invalidate()` หลัง (invalidate วิ่ง background)
  - เพิ่มการเช็ค `if (saving) return` ใน handleSave ป้องกัน double-click

### 3. OCR fill ผู้ซื้อผิด (upload-receipt-modal) ✅
- **อาการ:** OCR อ่าน buyerName ผิด (เช่น "บริษัท ครีท จำกัด" แทนที่จะเป็น org จริง)
- **Fix:**
  - **Auto-fill buyer จาก org ตอน mount** (เปลี่ยนจากเดิมที่ถอดออก session 8 เพราะทำให้ org overwrite OCR)
  - **OCR ไม่ override ข้อมูล org** — เปลี่ยน `data.buyerName || p.buyerName` → `p.buyerName || data.buyerName` (prefer form value)
  - ถ้า buyer จากเอกสารไม่ตรงกับ org → แสดง warning (buyerCheck) ให้ user ตรวจสอบ

### 4. "✅ แนบแล้ว" กดไม่ได้ (expenses/page.tsx) ✅
- **อาการ:** เมื่อ documentType = id_card หรือ substitute_receipt แต่ receiptUrl ว่าง → UI แสดง "✅ แนบแล้ว" เป็น span (ไม่ clickable)
- **Fix:**
  - เปลี่ยน span เป็น "📎 แนบไฟล์" button (สีส้ม) ให้ user กด re-attach ได้
  - เพิ่ม URL ใน title tooltip เพื่อ debug ได้ง่ายขึ้น
  - `hasDocumentation && canAttachReceipt` → ถ้ามี documentType แต่ไม่มีไฟล์ → ให้แนบเพิ่ม

### 5. Error "Cannot read properties of undefined (reading 'from')" 🔍 ต้องสอบสวนต่อ
- **อาการ:** User เจอ error นี้ใน modal ไม่มีใบเสร็จ
- **ที่ตรวจแล้ว:** ไม่พบการเรียก `.from()` บน undefined ใน client code ของ modal (เช็ค Array.from, Object.fromEntries, Buffer.from แล้วทั้งหมดปลอดภัย)
- **เป็นไปได้ว่า:**
  - `TRPCClientError.from(...)` ใน `@trpc/client/httpBatchLink` — error ที่ wrap trpc response ผิดพลาด → ต้องดู network response
  - pdfjs-dist v5 render() ล้มเหลว (หลัง upload ID card เป็น PDF)
- **แนะนำ user:** เปิด DevTools → Console → copy stack trace เต็มๆ + Network tab ดู request ที่ fail → จะช่วย pinpoint ได้แม่นขึ้น
- **Defensive fix:** handleSave ห่อ try-catch ดีแล้ว — error จะแสดงใน `error` state (สีแดงบน modal)

---

## ✅ สิ่งที่แก้ไขใน Session 9 (2026-04-17)

### Bug 1 + Bug 2 Fix — Receipt Attach Flow ✅
**ปัญหา:**
- Field ใบเสร็จแสดง "✅ แนบแล้ว" แต่คลิกดูไฟล์ไม่ได้ (receiptUrl ว่าง)
- แนบใบเสร็จเรียบร้อยแล้ว field ไม่ update (ยังแสดง "📎 แนบ")

**Root Cause:**
- `/api/payments/upload` → เซ็ต `ReceiptURL` ใน Google Sheets แล้วคืน `fileUrl` ใน response
- แต่ใน `upload-receipt-modal.tsx` + `manual-receipt-modal.tsx` (attach mode):
  - ไม่ได้ parse response → ถ้า upload fail จะ silent fail
  - ไม่ได้ส่ง `receiptUrl` ต่อให้ `recordReceipt` → อาศัยการ write ของ upload endpoint อย่างเดียว
  - ถ้า upload fail → `receiptUrl` ใน Sheets ว่าง → UI จึงยังแสดง "📎 แนบ"

**แก้ไข:**
1. `upload-receipt-modal.tsx` (attach + create mode) — Parse upload response, throw error ถ้า fail, ส่ง `receiptUrl` ให้ `recordReceipt`
2. `manual-receipt-modal.tsx` (attach + create mode) — แก้แบบเดียวกัน
3. Files: `src/app/(app)/expenses/upload-receipt-modal.tsx` + `src/app/(app)/expenses/manual-receipt-modal.tsx`

### Feature 1: เพิ่ม Payee ใหม่จาก Modal ตั้งเบิก ✅
**ที่:** `/payments` → Modal ตั้งเบิก manual (`payment-modal.tsx`)
- เพิ่มปุ่ม "+ ใหม่" ข้าง dropdown ผู้รับเงิน
- คลิกแล้วขึ้น inline form: ชื่อ, Tax ID, สาขา (HQ/Branch+เลขสาขา), ธนาคาร+เลขบัญชี, VAT checkbox, WHT %, เบอร์โทร, email, ที่อยู่
- กด "บันทึก Payee" → เรียก `trpc.payee.create` → auto-select payee ใหม่ + auto-fill VAT/WTH จาก payee นั้น
- ใช้ `utils.payee.list.invalidate()` เพื่อ refresh dropdown ให้เห็น payee ใหม่

### Feature 2: บันทึกรายจ่าย "ไม่มีใบเสร็จ" → คำนวน VAT อัตโนมัติ ✅
**ที่:** `/expenses` → Modal ไม่มีใบเสร็จ → Tab "รายการค่าใช้จ่าย" (`manual-receipt-modal.tsx`)
- User กรอกแค่ **ยอดรวมก่อนภาษี**
- ติ๊ก **checkbox "จด VAT 7%"** (แสดงว่าผู้รับเงินเป็น VAT)
- ระบบ auto-calculate:
  - `vatAmount = subtotal × 0.07` (ถ้าติ๊ก) หรือ 0 (ถ้าไม่ติ๊ก)
  - `totalAmount = subtotal + vatAmount`
- ทั้ง VAT amount + ยอดชำระรวม VAT เป็น read-only (แสดงผลเท่านั้น)

---

## 🐛 Bugs ที่ต้องแก้ใน Session 9 (จาก Session 8) — แก้แล้ว ✅

### Bug 1: "✅ แนบแล้ว" คลิกแล้วดูไฟล์ไม่ได้
- **อาการ**: field ใบเสร็จแสดง "✅ แนบแล้ว" แต่คลิกแล้วเปิดไฟล์ไม่ได้
- **สาเหตุที่เป็นไปได้**: 
  - รายการที่สร้างจาก "ไม่มีใบเสร็จ" modal ใน **create mode** จะ upload ID card ไป Google Drive ตอน save (code ใหม่ session 8) แต่ `/api/payments/upload` endpoint เซ็ตค่าลง column `ReceiptURL` ใน Google Sheets → ต้องตรวจสอบว่า `ReceiptURL` ถูกเซ็ตจริงหลัง upload
  - Receipt column ใน expenses/page.tsx เช็ค `p.receiptUrl` → ถ้า API ส่ง field ชื่ออื่น (เช่น `receiptURL` vs `receiptUrl`) ก็จะไม่ match
  - อาจเป็นเรื่อง field mapping ใน `payment.list` procedure → ตรวจสอบว่า row จาก Google Sheets map ลง `receiptUrl` ถูกต้อง
- **ไฟล์ที่เกี่ยวข้อง**:
  - `src/app/api/payments/upload/route.ts` — ดูว่า upload เสร็จแล้วเซ็ต column อะไรใน Sheets
  - `src/server/routers/payment.router.ts` (list procedure) — ดูว่า map field จาก Sheets ลง output ถูกต้อง
  - `src/app/(app)/expenses/page.tsx` (line ~298-370) — receipt column logic

### Bug 2: แนบใบเสร็จเสร็จแล้ว field ไม่ update + ดูไฟล์ไม่ได้
- **อาการ**: กด "📎 แนบ" → เลือก "มีใบเสร็จ" → upload ใบเสร็จ + บันทึกเรียบร้อย → แต่ field ใบเสร็จยังเป็น "📎 แนบ" ไม่เปลี่ยนเป็น "✅ แนบแล้ว"
- **สาเหตุที่เป็นไปได้**:
  - Attach mode ใน UploadReceiptModal (session 8) เปลี่ยนจาก `payment.update` → `recordReceipt` + `/api/payments/upload` แยกกัน
  - `/api/payments/upload` อาจเซ็ต `ReceiptURL` ผ่าน Drive upload แต่ `recordReceipt` มี parameter `receiptUrl` ที่ optional → ถ้าไม่ส่ง URL กลับมา recordReceipt จะไม่อัปเดต ReceiptURL
  - **ปัญหาน่าจะอยู่ตรงนี้**: ใน attach mode ใหม่, file upload (/api/payments/upload) จะเซ็ต ReceiptURL ใน Sheets อยู่แล้ว แต่ `recordReceipt` ถูกเรียกต่อโดยไม่ส่ง receiptUrl → อาจ overwrite ReceiptURL เป็นค่าว่าง
  - หรือ `/api/payments/upload` อาจไม่ได้เซ็ต ReceiptURL — ต้องตรวจสอบ
  - หลังบันทึก ต้อง invalidate query ให้ตาราง refresh
- **ไฟล์ที่เกี่ยวข้อง**:
  - `src/app/(app)/expenses/upload-receipt-modal.tsx` (line ~285-300) — attach mode save logic
  - `src/app/api/payments/upload/route.ts` — ดู response ว่าคืน URL กลับมาไหม
  - `src/server/routers/payment.router.ts` (recordReceipt, line ~373) — ดูว่า receiptUrl undefined จะ overwrite หรือ skip

### แนวทางแก้ (Recommended) — แก้ครบแล้วใน Session 9 ✅
1. ตรวจ `/api/payments/upload` → เซ็ต ReceiptURL ใน Sheets จริง (line 91 `updates.ReceiptURL = result.webViewLink`) + response คืน `fileUrl`
2. ✅ แก้ upload-receipt-modal + manual-receipt-modal ให้ parse response, throw error ถ้า fail, ส่ง receiptUrl ต่อให้ recordReceipt
3. `payment.list` field mapping ReceiptURL → receiptUrl ทำงานถูกต้อง (line 70 `receiptUrl: payment.ReceiptURL || ""`)
4. Invalidation ถูกต้องแล้ว: `utils.payment.list.invalidate()` + `refreshAll()` ใน parent page

---

## สิ่งที่ยังไม่ได้ทำ (Pending)

### Phase 2 — เหลือ (ไม่ urgent)
- Google Drive folder auto-create ตามโปรเจกต์ (เมื่อสร้าง Event ใหม่)

### Phase 3 — Payment System (เหลือ ~5%)
- Auto-generate PDF download (WHT cert, Payment voucher) — ตอนนี้ render HTML แต่ยังไม่ generate PDF file

### Phase 5 — LINE (เหลือ ~20%)
- ตั้ง APP_BASE_URL ตอน deploy
- ลบไฟล์เก่า: `src/app/api/webhook/line/route.ts`, `src/lib/ocr/pdf-to-png-server.ts`

### Phase 4 — Reports & Dashboard (ยังไม่เริ่ม)
- Dashboard (admin/manager/accountant/staff)
- รายงานเคลียร์งบ
- Weekly Payment + Bank Sheet + Print
- ค้นหารายจ่าย
- Inactive Payees
- Audit logs

### Phase 6 — Billing & Launch (ยังไม่เริ่ม)
- Stripe integration
- Subscription plans + credit system
- Landing page
- Migration tool
- Beta testing

---

## OCR Pipeline (ปัจจุบัน)

```
รูป/PDF → Akson OCR (text extraction, ~2-3s)
        → GPT-4o (parse text → JSON, ~5-8s)
        → Structured receipt data
        
Fallback: ถ้า Akson fail → GPT-4o Vision (single-pass)
```

**Provider priority** (`src/lib/ocr/index.ts`):
1. AksonOcrProvider (if AKSONOCR_API_KEY set)
2. OpenAIOcrProvider (GPT-4o Vision fallback)

**ทั้ง LINE และ Web app ใช้ `parseReceipt()` ตัวเดียวกัน**

---

## Tech Stack
- **Framework**: Next.js 14.2 (App Router)
- **API**: tRPC 11.16
- **DB**: Prisma 5.22 → Supabase PostgreSQL
- **Auth**: Google OAuth + JWT (jose)
- **Styling**: Tailwind CSS v4 (@theme, ไม่ใช้ config file)
- **Google**: Sheets API v4 + Drive API v3
- **OCR**: Akson OCR + GPT-4o (hybrid)
- **LINE**: Messaging API (webhook + push/reply)

---

## Key Files

### LINE Integration
- `src/lib/line/handlers.ts` — LINE event handlers (follow, text, media, postback)
- `src/lib/line/flex/payment-confirm.ts` — Flex card (OCR confirm + saved success)
- `src/lib/line/messaging.ts` — LINE API wrapper (push, reply, verify)
- `src/lib/line/user-org.ts` — Resolve LINE user → org context
- `src/lib/line/defaults.ts` — Ensure default event/payee for LINE
- `src/app/api/line/webhook/route.ts` — Webhook route (new, correct one)

### OCR
- `src/lib/ocr/index.ts` — Provider router (Akson → OpenAI)
- `src/lib/ocr/akson-provider.ts` — Akson hybrid (OCR text + GPT parse)
- `src/lib/ocr/openai-provider.ts` — GPT-4o Vision provider
- `src/lib/ocr/types.ts` — OcrParsedReceipt type

### Core Data CRUD (Phase 2)
- `src/app/(app)/events/page.tsx` — จัดการโปรเจกต์ (list + modal + Assignment Modal)
- `src/app/(app)/payees/page.tsx` — จัดการ Payee (list + modal)
- `src/app/(app)/banks/page.tsx` — จัดการธนาคาร (master list)
- `src/app/(app)/settings/org/company-banks-section.tsx` — บัญชีธนาคารบริษัท
- `src/server/routers/event.router.ts` — Event CRUD (list, getById, create, update, delete)
- `src/server/routers/payee.router.ts` — Payee CRUD (list, getById, create, update, delete)
- `src/server/routers/bank.router.ts` — Bank CRUD (list, create, delete)
- `src/server/routers/company-bank.router.ts` — Company Bank CRUD (list, listForPayment, create, update, delete)
- `src/server/routers/event-assignment.router.ts` — Event Assignment (listByEvent, availableMembers, assign, remove, batchAssign)

### Web App (Expenses/Payments/Approvals/Documents)
- `src/app/(app)/expenses/page.tsx` — บันทึกค่าใช้จ่าย
- `src/app/(app)/expenses/upload-receipt-modal.tsx` — Upload receipt (+ attach mode)
- `src/app/(app)/expenses/manual-receipt-modal.tsx` — ไม่มีใบเสร็จ
- `src/app/(app)/payments/page.tsx` — ตั้งเบิก (list + create/edit + document links)
- `src/app/(app)/payments/receipt-upload.tsx` — ReceiptUploadButton + ReceiptReviewModal (upload receipt + OCR + recordReceipt + amount mismatch warning)
- `src/app/(app)/payments/payment-modal.tsx` — Manual payment entry (R5 tax + R6 ownership)
- `src/app/(app)/payments/upload-invoice-modal.tsx` — Upload invoice
- `src/app/(app)/approvals/page.tsx` — อนุมัติรายการ (filter + bulk approve/reject + payment date)
- `src/app/(app)/payment-prep/page.tsx` — เตรียมจ่าย (multi-tab: overview/summary/cash/per-bank + Excel export)
- `src/app/(app)/documents/page.tsx` — เอกสาร/ใบเสร็จ (3 tabs: รอใบเสร็จ/รอเคลียร์/ครบแล้ว)
- `src/app/documents/wth-cert/[paymentId]/page.tsx` — WHT certificate (server-rendered)
- `src/app/documents/substitute-receipt/[paymentId]/page.tsx` — ใบรับรองแทนใบเสร็จ

### Core Services
- `src/server/services/google-sheets.service.ts` — Google Sheets CRUD (getAll, getFiltered, getById, appendRow, appendRowByHeaders, updateById, deleteById + domain methods)
- `src/server/services/google-drive.service.ts` — Google Drive upload/manage
- `src/server/lib/sheets-context.ts` — getSheetsService() + getDriveService() (auto-refresh token)
- `src/server/routers/_app.ts` — Root router (event, payment, org, payee, bank, companyBank, subscription, user, eventAssignment)
- `src/server/trpc.ts` — tRPC setup (publicProcedure, protectedProcedure, orgProcedure, permissionProcedure)
- `src/lib/calculations.ts` — Payment calculations (TTL, WTH, VAT, GTTL)
- `src/components/searchable-select.tsx` — Searchable dropdown component

### User Management
- `src/server/routers/user.router.ts` — User management (list, invite via LINE link, accept invitation, updateMember, removeMember)

### Config
- `.env.local` — Environment variables (has AKSONOCR_API_KEY, LINE tokens, Google OAuth, Supabase)
- `prisma/schema.prisma` — Database schema (8+ models including LineDraft, Invitation)
- `next.config.mjs` — serverComponentsExternalPackages: sharp, tesseract.js
- `src/app/globals.css` — Tailwind v4 @theme (brand colors, accent, component classes: app-btn, app-modal, app-table, app-badge etc.)

---

## Permission System

**13 Permissions** (ใน user_permissions table):
manageEvents, assignEvents, managePayees, manageBanks, updatePayments, deletePayments, approvePayments, viewReports, printReports, dashboardEvent, dashboardSummary, manageUsers, managePermissions

**4 Roles** with defaults: admin (all), manager (most except approve/manage users), accountant (approve + reports), staff (update payments + basic reports)

**tRPC Middleware**:
- `orgProcedure` — ต้อง login + มี org context
- `permissionProcedure("manageEvents", ...)` — ต้องมี permission เฉพาะ (admin bypass ทั้งหมด)

---

## Payment Creation Flow (Approval vs Direct)

### แนวคิด:
- **ตั้งเบิก** (`/payments` page) → สร้างด้วย `initialStatus: "pending"` (default) → เข้า flow อนุมัติ
- **บันทึกค่าใช้จ่าย** (`/expenses` page — upload-receipt-modal + manual-receipt-modal) → สร้างด้วย `initialStatus: "paid"` → ข้ามอนุมัติ (จ่ายแล้ว มีเอกสาร)

### ไฟล์ที่เกี่ยวข้อง:
- `src/server/routers/payment.router.ts` — PaymentInputSchema มี `initialStatus: z.enum(["pending", "paid"]).default("pending")`
  - ถ้า "paid" → set Status="paid", PaidAt=now, ApprovedBy/ApprovedAt=auto-fill, PaymentDate=today
  - ถ้า "pending" → Status="pending", PaidAt/ApprovedBy/ApprovedAt ว่าง (รอ approval flow)
- `src/app/(app)/expenses/upload-receipt-modal.tsx` — ส่ง `initialStatus: "paid"` ตอนสร้างรายการใหม่
- `src/app/(app)/expenses/manual-receipt-modal.tsx` — ส่ง `initialStatus: "paid"` ตอนสร้างรายการใหม่
- `src/app/(app)/approvals/page.tsx` — query เฉพาะ `{ status: "pending" }` จึงไม่แสดงรายการ expense ที่สร้างมา

---

## Event Assignment System (สร้าง Session 7)

### Router: `src/server/routers/event-assignment.router.ts`
- `listByEvent` (orgProcedure) — ดึง assignments ของ event, enrich ด้วย user info จาก DB
- `availableMembers` (orgProcedure) — สมาชิก org ที่ยังไม่ถูก assign ให้ event นี้
- `assign` (permissionProcedure "assignEvents") — มอบหมายสมาชิก + อัปเดต OrgMember.eventScope
- `remove` (permissionProcedure "assignEvents") — ถอน + อัปเดต eventScope
- `batchAssign` (permissionProcedure "assignEvents") — มอบหมายหลายคนพร้อมกัน

### UI: Assignment Modal ในหน้า Events
- ปุ่ม 👥 ที่แต่ละ row → เปิด modal
- SearchableSelect dropdown เลือกสมาชิก → กด "+ เพิ่ม"
- แสดง avatar, ชื่อ, email, วันที่ assign
- ปุ่ม ✕ ถอนสมาชิกออก

### Data Flow:
Google Sheets (EventAssignments tab) ← appendRow/deleteById
Supabase (OrgMember.eventScope) ← sync เพื่อ permission scoping

---

## Environment Variables ที่สำคัญ

```
# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Supabase
DATABASE_URL=...
DIRECT_URL=...

# LINE
LINE_MESSAGING_CHANNEL_SECRET=...
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=...

# OCR
AKSONOCR_API_KEY=ak_a76db482f5684cada99a55297a84f20f
OPENAI_API_KEY=...

# App
APP_BASE_URL=http://localhost:3000  ← ต้องเปลี่ยนตอน deploy
SESSION_SECRET=...
ENCRYPTION_KEY=...
```

---

## Payment Status Machine

```
pending → (approve) → approved → (markPaid) → paid → (clearReconciliation, team only) → cleared
pending → (reject) → rejected → (re-edit → resubmit) → pending
paid → (recordReceipt) → still "paid" (receipt attached)
paid → (updateExpense) → still "paid" (actualExpense recorded)
```

**Payment Router Procedures:**
list, getById, preview, create, update, recordReceipt, approve, reject, markPaid, clearReconciliation, updateExpense, delete

**Google Sheets PAYMENTS Columns (43 columns):**
PaymentID, EventID, PayeeID, ExpenseType, CompanyBankID, InvoiceNumber, InvoiceFileURL, Description, CostPerUnit, Days, NoOfPPL, TTLAmount, PctWTH, WTHAmount, VATAmount, GTTLAmount, Status, PaymentDate, DueDate, ApprovedBy, ApprovedAt, PaidAt, BatchID, IsCleared, ClearedAt, ReceiptURL, ReceiptNumber, ReceiptDate, DocumentType, ExpenseNature, CategoryMain, CategorySub, RequesterName, VendorTaxIdSnapshot, VendorBranchInfo, ActualExpense, Notes, CreatedAt, CreatedBy, CreatedByUserId, UpdatedAt

---

## คำสั่ง Dev + ทดสอบ Session 9

```bash
# Start dev server
cd aim-expense && npm run dev

# Type check เฉพาะ (ไม่ build)
cd aim-expense && npx tsc --noEmit

# ทดสอบ Bug 1+2 (Receipt Attach)
# 1. ไปหน้า /expenses (บันทึกค่าใช้จ่าย)
# 2. หารายการที่ status เป็น approved/paid/cleared + ยังไม่มี receipt (แสดง "📎 แนบ")
# 3. คลิก "📎 แนบ" → เลือก "มีใบเสร็จ"
# 4. แนบไฟล์ + กรอกฟอร์ม + กด "📎 แนบใบเสร็จ"
# 5. Verify: field เปลี่ยนเป็น "✅ แนบแล้ว" + คลิกเปิด Google Drive ได้
# 6. ทำซ้ำแต่เลือก "ไม่มีใบเสร็จ" แนบสำเนาบัตร
# 7. Verify: field เปลี่ยนเป็น "✅ แนบแล้ว" + คลิกเปิดสำเนาบัตรได้

# ทดสอบ Feature 1 (เพิ่ม Payee ใหม่ใน modal ตั้งเบิก)
# 1. ไปหน้า /payments (ตั้งเบิก)
# 2. กด "➕ สร้างรายการจ่าย"
# 3. กดปุ่ม "+ ใหม่" ข้าง dropdown ผู้รับเงิน
# 4. กรอกชื่อ (required) + ข้อมูลอื่นที่ต้องการ → กด "💾 บันทึก Payee"
# 5. Verify: Payee ใหม่ถูก auto-select + ดำเนินการตั้งเบิกต่อได้

# ทดสอบ Feature 2 (VAT auto-calc ใน modal ไม่มีใบเสร็จ)
# 1. ไปหน้า /expenses → กด "📝 ไม่มีใบเสร็จ"
# 2. ไป Tab "รายการค่าใช้จ่าย"
# 3. กรอก "ยอดรวมก่อนภาษี" = 1000
# 4. Verify: VAT = 0, ยอดรวม = 1000 (ยังไม่ติ๊ก VAT)
# 5. ติ๊ก checkbox "จด VAT 7%"
# 6. Verify: VAT = 70.00 (auto), ยอดรวม VAT = 1070.00 (auto)
```

## สิ่งที่ต้องระวัง
- Tailwind v4 ใช้ `@theme` ใน CSS ไม่ใช่ `tailwind.config.ts`
- Google Sheets เป็น user's data — ต้อง resolve orgContext + get accessToken ก่อนเรียก service
- tRPC routers ทั้งหมด implement ครบแล้ว (ไม่มี skeleton/TODO เหลือ)
- `appendRowByHeaders()` ใน GoogleSheetsService ป้องกัน column misalignment ได้ดีกว่า `appendRow()`
- User invite ผ่าน LINE link (token-based, 24hr expiry)
