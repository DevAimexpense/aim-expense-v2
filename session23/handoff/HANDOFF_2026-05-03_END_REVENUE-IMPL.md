# Session 23 → Session 24 — Handoff (FINAL)

> **Created:** 2026-05-03 (end of Session 23)
> **Reason:** S23 = รายได้ Implementation Phase 1 (Customers + DocPrefix) + Phase 2 (Quotations CRUD)
> **Repo:** `~/Code/Aim Expense V2/aim-expense`
> **Worktree:** `.claude/worktrees/agitated-rhodes-4dd891`
> **Branch:** `claude/agitated-rhodes-4dd891`
> **Type check:** ✅ 0 errors
> **Smoke test:** 🟡 Not run (no `.env` in worktree — รอ smoke test ใน main repo)

---

## 🎯 ที่ทำใน Session 23

### ✅ Phase 1 — Customers + DocPrefix + Permissions (commit 346546f)

**1. Permission keys ขยาย 14 → 18**
- `manageCustomers` / `manageQuotations` / `manageBillings` / `manageTaxInvoices`
- เพิ่ม `revenue` permission group + Thai labels
- Role default ตามตาราง design doc 5.2:
  - admin: ทั้ง 4 keys
  - manager: 3 keys (ไม่มี TaxInvoices)
  - accountant: ทั้ง 4 keys
  - staff: ไม่มีเลย
- ⚠️ **Note:** revenue keys ยังไม่มีใน Prisma `UserPermission` — fallback ตาม role-default
  เหมือน `editPaymentAfterApproval`. /permissions UI ยังไม่ render revenue group
  (defer S24 + Prisma migration)
- `user.updatePermission` accept revenue keys ใน Zod แต่ throw `NOT_IMPLEMENTED` เพราะไม่มี column

**2. DocPrefix infrastructure (Q7 — customizable from MVP)**
- New `src/server/lib/doc-number.ts`:
  - `getDocPrefix(sheets, type)` — อ่าน Config.DOC_PREFIX_QT/BIL/TI (default = type literal)
  - `getAllDocPrefixes(sheets)` — บิ้น 1 API call
  - `computeNextDocNumber(sheets, type, year, tab, statusFilter?)` — `{PREFIX}-{YEAR}-{4digit}`, reset per year
  - `isValidDocPrefix(value)` — `[A-Z0-9/-]`, max 8, no space
- `google-sheets.service.ts` → `setConfig(key, value)` (upsert ใน Config tab)
- `org.router.ts` → 2 procedures:
  - `getDocPrefixes` (orgProcedure) — load 3 prefixes
  - `updateDocPrefixes` (orgProcedure + admin check) — validate + upsert + AuditLog

**3. /settings/org → section "🔢 เลขที่เอกสาร"**
- New `doc-prefix-section.tsx` — 3 prefix inputs + live preview + inline validation + warning text
- Mounted ใน `form.tsx` ใต้ CompanyBanksSection

**4. CUSTOMERS sheet tab (auto-migrate)**
- เพิ่มใน `SHEET_TABS.CUSTOMERS = "Customers"`
- Headers 16 columns ตาม design doc 4.2
- Domain methods: `getCustomers()` / `getCustomerById(id)`

**5. customer.router.ts**
- Procedures: list / getById / create / update / delete
- All mutations ใช้ `permissionProcedure("manageCustomers")` + AuditLog
- Delete guard: ห้ามลบถ้ามีใน Quotations
- Auto-call `ensureAllTabsExist()` ใน list + create (auto-migration on first use)

**6. /customers UI (plan-gated pro+)**
- `page.tsx` — server entry + plan check (free/basic → redirect dashboard)
- `customers-client.tsx` — DataTable + filter + CustomerModal (clone of PayeeModal)
- 16 fields: name/taxId/branch/isVAT/contact/phone/email/2 addresses/payment terms (datalist NET 0/15/30/60/90)/WHT%/notes
- Sidebar: เพิ่ม "ลูกค้า" ใน "ข้อมูลหลัก" group + permission gate

**7. Sidebar revenue group permission gates**
- ใบเสนอราคา → `permission: "manageQuotations"`
- ใบวางบิล → `permission: "manageBillings"`
- ใบกำกับภาษี → `permission: "manageTaxInvoices"`

### ✅ Phase 2 — Quotations CRUD (commit a4aaf16)

**1. QUOTATIONS + QUOTATION_LINES sheet tabs**
- 22 + 9 columns ตาม design doc 4.3 / 4.4
- Domain methods: `getQuotations()` / `getQuotationById(id)` / `getQuotationLines(quotationId)`

**2. quotation.router.ts**
- `computeQuotationTotals(lines, vatIncluded, discountAmount)` — exported helper
  - VAT exclusive: `vatAmount = subtotal × 0.07`
  - VAT inclusive: `vatAmount = grandTotal × 7/107`
- Procedures:
  - `list({ status?, customerId?, from?, to? })` — orgProcedure, sorted desc
  - `getById({ quotationId })` — returns `{ header, lines }` combined
  - `create` — permissionProcedure + customer snapshot + computeNextDocNumber + try/catch with cleanup
  - `update` — only if status === "draft" (replace strategy: header + delete-and-reinsert lines)
  - `send` — draft → sent
  - `accept` — sent → accepted
  - `reject` — sent → rejected
  - `void` — any non-void/converted → void
- 🔴 **Q2 mitigation:** create wraps lines in try/catch → cleanup orphan header + lines if anything fails
- 🔴 **Q3 mitigation:** snapshot fields (CustomerNameSnapshot/TaxIdSnapshot/AddressSnapshot) เก็บตอน create
- 🔴 **Q7 mitigation:** computeNextDocNumber filter by year prefix → reset ทุกปี
- ❌ **Defer:** convertToBilling (S24), convertToTaxInvoice (S25)

**3. /quotations list page**
- Filters: status / customer / date range
- Status badge component (exported as `StatusBadge` for reuse in detail page)
- Auto-derived "หมดอายุ" warning if validUntil < today && status === "sent"
- Empty state + LoadingSkeleton

**4. /quotations/new — single-page complex form**
- Section 1: Customer picker + inline modal "+ เพิ่มลูกค้าใหม่"
- Section 2: DocDate / ValidUntil / ProjectName / EventID
- Section 3: Dynamic line items table (add/remove rows, computed line totals live)
- Section 4: VAT inclusive/exclusive radio + DiscountAmount + live totals breakdown
- Section 5: Notes + Terms textareas
- Validation: lines ≥ 1, all required, validUntil ≥ docDate
- On success → router.push(`/quotations/[id]`)

**5. /quotations/[id] detail view**
- Read-only header + customer info + lines table + totals
- Status-conditional action buttons:
  - draft → ส่งให้ลูกค้า + แก้ไข + ยกเลิก
  - sent → ลูกค้ายืนยัน + ลูกค้าปฏิเสธ + ยกเลิก
  - accepted → "สร้างใบวางบิล (S24)" disabled + ยกเลิก
  - rejected/void → no actions
- PDF button disabled (S24+)

**6. /quotations/[id]/edit**
- Re-uses `NewQuotationClient` with `mode="edit"` + `initial` prop
- Block edit if status !== "draft" (shows "แก้ไขไม่ได้" message)
- `EditQuotationClient` loads via `quotation.getById` and passes initial to form

---

## 📦 Files changed (committed in worktree branch)

### Phase 1 (commit 346546f — 14 files, +1445/-5)
```
M  src/types/permissions.ts
M  src/lib/permissions.ts
M  src/lib/auth/middleware.ts
M  src/server/services/google-sheets.service.ts
M  src/server/routers/org.router.ts
M  src/server/routers/user.router.ts
M  src/server/routers/_app.ts
M  src/components/layout/sidebar.tsx
M  src/app/(app)/settings/org/form.tsx
A  src/server/lib/doc-number.ts
A  src/server/routers/customer.router.ts
A  src/app/(app)/settings/org/doc-prefix-section.tsx
A  src/app/(app)/customers/page.tsx
A  src/app/(app)/customers/customers-client.tsx
```

### Phase 2 (commit a4aaf16 — 10 files, +2260)
```
M  src/server/routers/_app.ts
A  src/server/routers/quotation.router.ts
A  src/app/(app)/quotations/page.tsx
A  src/app/(app)/quotations/quotations-client.tsx
A  src/app/(app)/quotations/new/page.tsx
A  src/app/(app)/quotations/new/new-quotation-client.tsx
A  src/app/(app)/quotations/[id]/page.tsx
A  src/app/(app)/quotations/[id]/quotation-detail-client.tsx
A  src/app/(app)/quotations/[id]/edit/page.tsx
A  src/app/(app)/quotations/[id]/edit/edit-quotation-client.tsx
```

---

## 🚀 Commands พี่ทำเพื่อ sync + ship S23

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
rm -f .git/index.lock

# Copy ทั้ง src + session23 จาก worktree → main
cp -R .claude/worktrees/agitated-rhodes-4dd891/src .
cp -R .claude/worktrees/agitated-rhodes-4dd891/session23 .

# (Optional) confirm + type check ใน main
npx tsc --noEmit

# Smoke test (ก่อน commit) — ดูข้อ "Smoke checklist" ด้านล่าง
npm run dev

# Commit (single-line!)
git add src session23
git commit -m 'feat(S23): รายได้ Phase 1+2 — Customers + DocPrefix + Quotations CRUD + state transitions'
git push
```

**Alternative (single commit):** Combined message ก็ได้ — แล้วแต่พี่ จะทำเป็น 2 commits (Phase 1 + Phase 2 แยก) ก็ใช้ git commits จาก worktree:
```bash
git fetch
git cherry-pick 346546f a4aaf16
git push
```

---

## ✅ Smoke checklist (ใน main repo + dev server)

### Phase 1
- [ ] /settings/org → เห็น section "🔢 เลขที่เอกสาร" + 3 inputs + preview ตัวอย่าง
- [ ] แก้ prefix QT → "INV" → save → reload หน้า → ค่ายังอยู่
- [ ] ลอง prefix invalid (มี space, > 8 char, lowercase) → error ขึ้นใต้ field
- [ ] Login as admin → /customers visible ใน sidebar "ข้อมูลหลัก"
- [ ] /customers → เพิ่มลูกค้า (ทดสอบทั้ง HQ + Branch)
- [ ] /customers → แก้ไข + ลบ (ลูกค้าที่ไม่ได้ใช้)
- [ ] Login as staff → /customers ไม่เห็นใน sidebar (sidebar gate)
- [ ] Login as staff → ไป /customers ตรงๆ → server-side: page โหลดแต่ tRPC mutation block

### Phase 2
- [ ] /quotations → empty list message
- [ ] + สร้างใบเสนอราคา
  - [ ] เลือกลูกค้า → display snapshot info (taxId, address)
  - [ ] + เพิ่มลูกค้าใหม่ (inline modal) → ลูกค้าใหม่ถูกเลือกอัตโนมัติ
  - [ ] เพิ่ม 3 lines (varied qty/price/discount)
  - [ ] toggle VAT exclusive → check totals (manual: subtotal × 1.07 = grandTotal)
  - [ ] toggle VAT inclusive → check totals (subtotal = grandTotal × 100/107)
  - [ ] บันทึก → redirect ไป /quotations/[id]
- [ ] /quotations/[id] (draft) → ส่ง / แก้ไข / ยกเลิก buttons แสดง
- [ ] กด "ส่งให้ลูกค้า" → status = sent → ปุ่มเปลี่ยน (ลูกค้ายืนยัน/ปฏิเสธ/ยกเลิก)
- [ ] กด "ลูกค้ายืนยัน" → status = accepted → ปุ่ม "สร้างใบวางบิล (S24)" disabled + ยกเลิก
- [ ] สร้างใหม่ → reject path → status = rejected
- [ ] สร้างใหม่ → void ตอน draft → status = void
- [ ] /quotations/[id]/edit (status = sent) → "แก้ไขไม่ได้" message
- [ ] List filter: status / customer / date range
- [ ] เปิด Google Sheet → tab Customers/Quotations/QuotationLines มี headers ครบ + ข้อมูลตรง
- [ ] DocNumber: QT-2026-0001 (หรือ prefix custom ที่พี่ตั้งใน /settings/org)

### Cross-cutting
- [ ] AuditLog: เปิด Prisma Studio ดู audit_log table → events: create/update/delete customer + create/update + state transitions ของ quotation
- [ ] Free/Basic plan: redirect ที่ /customers + /quotations + /quotations/new → /dashboard?upgrade=required
- [ ] Manager role (ถ้ามี): ทำได้ทุกอย่างใน /customers + /quotations (manageTaxInvoices ต่างหาก — staff ไม่ได้)

---

## ⚠️ Known limitations / Watch out (S23 specific)

1. **🟡 Revenue permission keys not in Prisma yet**
   - manageCustomers/Quotations/Billings/TaxInvoices = role-default-only
   - /permissions UI ไม่ render revenue group (intentional — defer S24)
   - `user.updatePermission` throw `NOT_IMPLEMENTED` ถ้า toggle key พวกนี้
   - **Action S24:** เพิ่ม Prisma migration + ขยาย /permissions UI

2. **🟡 No PDF generation yet**
   - /quotations/[id] → ปุ่ม "📄 PDF" disabled (label "เร็ว ๆ นี้")
   - Defer S24 (พร้อม Billings PDF)

3. **🟡 No Quotation → Billing conversion**
   - /quotations/[id] (accepted) → ปุ่ม "สร้างใบวางบิล (S24)" disabled
   - Defer S24

4. **🟡 Update strategy = delete-and-reinsert lines**
   - ตอน edit draft, lines ทั้งหมดจะถูก delete + insert ใหม่
   - LineID เปลี่ยน — แต่ไม่กระทบเพราะ status = draft (ยังไม่ snapshot)
   - Acceptable — diff strategy ซับซ้อนเกินสำหรับ MVP

5. **🟡 No "expired" status field**
   - design doc 3.1: expired = derived (UI auto: validUntil < today && status === "sent")
   - List page แสดง "⚠️ หมดอายุ" badge เมื่อตรงเงื่อนไข

6. **🟡 ห้ามเปลี่ยน DocPrefix หลัง issue เอกสาร** (warning text มีอยู่แล้ว)
   - System อนุญาต แต่ลำดับเลขจะไม่ continuous กับเดิม

### Carry-forward จาก S22

- 🟡 WHT Phase 2 ใบสรุป polish — รอ screenshot
- 🟡 Smoke test ใบแนบ ภงด.53 — ค้างจาก S20
- 🟡 Sidebar label "รายงาน ภพ.30" — rename ใน S25

---

## 🔋 Environment State (จบ S23)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Worktree:        .claude/worktrees/agitated-rhodes-4dd891
Branch:          claude/agitated-rhodes-4dd891
HEAD:            a4aaf16 — S23 Phase 2 (uncommitted ใน main, รอ sync)
Vercel:          Hobby (downgraded 2026-05-02)
Type check:      ✅ 0 errors
Smoke test:      🟡 ค้างใน main repo
DB connection:   ✅ Healthy (Supabase Singapore)
```

### Phase status

| Phase | สถานะ | หมายเหตุ |
|-------|-------|----------|
| Phase 4 Reports WHT — Phase 2 | 🟡 95% | S20 polish ค้าง |
| Phase 4 Reports VAT — Phase 1 | ✅ 100% | S21 |
| Phase 4 Reports VAT — Phase 2 | ❌ 0% | รอ tax invoice → S25 |
| Settings → Google | ✅ 100% | S21 |
| Settings → Permissions | ✅ 100% | S21 |
| Settings → Billing | ❌ 0% | Phase 6 — รอ Stripe |
| **รายได้ Foundation Design** | ✅ 100% | S22 |
| **รายได้ — Customers + DocPrefix** | ✅ 100% | **S23 Phase 1** ✨ |
| **รายได้ — Quotations** | ✅ 100% | **S23 Phase 2** ✨ |
| รายได้ — Billings | ❌ 0% | S24 |
| รายได้ — Tax Invoices | ❌ 0% | S25 |

---

## 🎯 งาน Session 24 — Priority

### 🚀 ลำดับงาน:

1. **S24 Billings + state transitions + recordPayment**
   - Add BILLINGS + BILLING_LINES tabs
   - billing.router.ts — full CRUD + send/recordPayment/void
   - Quotation → Billing convert procedure (`convertToBilling`)
   - /billings page + form + recordPayment modal
   - Plan gate (pro+) + sidebar permission gate

2. **PDF templates — Quotation + Billing** (ใช้ pattern จาก S20)
   - QuotationPdf.tsx (header + lines + totals + signature)
   - BillingPdf.tsx (similar + bank account section)
   - กดปุ่ม "📄 PDF" จาก /quotations/[id] → save to Drive + open

3. **(Pre-req S24)** Prisma migration: add 4 revenue permission columns ใน `user_permissions` table
   - ปรับ middleware.ts (use stored value with role fallback)
   - ปรับ user.router.ts listPermissions (return stored)
   - ปรับ user.router.ts updatePermission (allow revenue keys + write to DB)
   - เพิ่ม `revenue` ใน GROUP_ORDER ของ /permissions UI

4. **(Optional)** WHT Phase 2 polish — ถ้าพี่ส่ง screenshot

---

## 📋 User & Org info (พี่)

```
User:
  id              = 333d8b87-8b59-492f-b684-ee41c57768f8
  email           = dev@aimexpense.com
  lineUserId      = Ua42c7d7729c56f8eab021918c168761c

Org:
  id   = 32e5a820-ddb1-4850-95f3-b226d4e3a3e2
  name = บริษัท อาร์โต จำกัด
```

---

*Handoff by Claude — Session 23 end — 2026-05-03*
