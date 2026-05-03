# Session 24 Phase 1 — Billings + Q→B Convert (FINAL)

> **Created:** 2026-05-03 (continued same day from S23)
> **Worktree commit:** `1450a7b`
> **Branch:** `claude/agitated-rhodes-4dd891`
> **Type check:** ✅ 0 errors
> **Smoke test:** 🟡 Not run (รอ smoke test ใน main repo)

---

## 🎯 ที่ทำใน S24 Phase 1

### ✅ Pre-req: Prisma migration — revenue permissions

**ขยาย UserPermission table** เพื่อ support per-user override สำหรับ revenue keys:
- `manageCustomers` / `manageQuotations` / `manageBillings` / `manageTaxInvoices`
- All `Boolean @default(false) @map("manage_*")`

**Update server logic ตาม pattern เดิม (stored ?? roleDefault):**
- `src/lib/auth/middleware.ts` — read perms?.manageCustomers ?? roleDefaults.manageCustomers (เป็นต้น)
- `src/server/routers/user.router.ts` listPermissions — เพิ่ม 4 keys ตาม pattern เดิม
- `src/server/routers/user.router.ts` updatePermission — ลบ `NOT_IMPLEMENTED` guard ออก (now writable)

**UI:**
- `src/app/(app)/permissions/permissions-client.tsx` — เพิ่ม `revenue` ใน `GROUP_ORDER` (ใต้ payments)

### ✅ Phase 1a — Sheet schemas
- `SHEET_TABS.BILLINGS = "Billings"`
- `SHEET_TABS.BILLING_LINES = "BillingLines"`
- 31 columns + 9 columns ตาม design doc 4.5/4.6
- Domain methods: `getBillings()` / `getBillingById()` / `getBillingLines()`

### ✅ Phase 1b — billing.router.ts
**Helper:** `computeBillingTotals(lines, vatIncluded, discountAmount, whtPercent)`
- Same as Quotation + adds `whtAmount` (subtotal × WHT% / 100) + `amountReceivable` (grandTotal - whtAmount)

**Procedures:**
- `list({ status?, customerId?, from?, to? })` — orgProcedure, sorted desc
- `getById({ billingId })` — returns `{ header, lines }` + `balance` derived
- `create` — permissionProcedure("manageBillings") + customer snapshot + try/catch cleanup
- `update` — only if status === "draft" (delete-and-reinsert lines)
- `send` — draft → sent
- `void` — any non-void/non-paid → void
- `recordPayment({ amount, paidDate, paymentMethod, bankAccountId?, notes? })`:
  - guards: status ≠ void/draft/paid, amount ≤ remaining balance
  - PaidAmount += amount; status auto: partial (< grandTotal) or paid (≥)
  - PaidDate, PaymentMethod, BankAccountID updated
  - AuditLog เก็บ method + amount

### ✅ Phase 1c — quotation.router.ts → `convertToBilling`
- Permission: `manageBillings` (not `manageQuotations` — billing creator decides)
- Guards: quotation.Status === "accepted"
- Snapshot: ใช้ Customer*Snapshot จาก quotation header (immutable history)
- Lines: copy ทุก line + same totals (preserve, ไม่ recompute)
- WHT: input.whtPercent ?? customer.DefaultWHTPercent ?? 0
- Side effect: Quotation Status → "converted" (locks)
- AuditLog 2 entries (billing.create + quotation.converted)

### ✅ Phase 1d — /billings list page
- Filters: status (draft/sent/partial/paid/void), customer, date range
- Status badge component exported (`BillingStatusBadge`)
- "⚠️ เกินกำหนด" derived warning (dueDate < today && balance > 0)
- Columns: docNumber / docDate+dueDate / customer / project / status / grandTotal / paidAmount / balance

### ✅ Phase 1e — /billings/new + /billings/[id] + /billings/[id]/edit
**Form** (`/billings/new`):
- Same section structure as /quotations/new
- + `WHT%` input (auto-fill จาก customer.DefaultWHTPercent ตอนเลือกลูกค้า ใน mode=create)
- + `dueDate` (default = docDate + 30 days)
- Live totals: subtotal / VAT / grandTotal / WHT / **amountReceivable** (yellow if WHT > 0)

**Detail** (`/billings/[id]`):
- Read-only header + customer + lines
- Status-conditional buttons:
  - draft: ส่ง / แก้ไข / ยกเลิก
  - sent / partial: 💰 บันทึกรับเงิน / ยกเลิก
  - paid: → "ออกใบกำกับภาษี (S25)" disabled
- `RecordPaymentModal`: amount (max=balance) / paidDate / paymentMethod (5 options) / notes
- Link back to source quotation ถ้ามี

**Edit** (`/billings/[id]/edit`):
- Re-uses `NewBillingClient` with mode="edit" + initial
- Block ถ้า status ≠ "draft"

### ✅ Phase 1f — Convert button ใน /quotations/[id]
- Status === "accepted" → ปุ่ม "→ สร้างใบวางบิล" (เปลี่ยนจาก disabled S24)
- คลิก → `ConvertToBillingModal`: docDate / dueDate / whtPercent
- บันทึก → quotation Status = "converted" + redirect to `/billings/[newId]`

---

## 📦 Files (commit 1450a7b — 17 files)

```
M prisma/schema.prisma
M src/lib/auth/middleware.ts
M src/server/routers/user.router.ts
M src/server/routers/_app.ts
M src/server/routers/quotation.router.ts
A src/server/routers/billing.router.ts
M src/server/services/google-sheets.service.ts
M src/app/(app)/permissions/permissions-client.tsx
M src/app/(app)/quotations/[id]/quotation-detail-client.tsx
A src/app/(app)/billings/page.tsx
A src/app/(app)/billings/billings-client.tsx
A src/app/(app)/billings/new/page.tsx
A src/app/(app)/billings/new/new-billing-client.tsx
A src/app/(app)/billings/[id]/page.tsx
A src/app/(app)/billings/[id]/billing-detail-client.tsx
A src/app/(app)/billings/[id]/edit/page.tsx
A src/app/(app)/billings/[id]/edit/edit-billing-client.tsx
```

---

## 🚀 Sync commands พี่ทำใน main repo

⚠️ **Important:** S24 มี Prisma schema change — ต้องรัน migration ก่อน smoke test!

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
rm -f .git/index.lock

# 1. Copy ทุกอย่าง: src + prisma + session24 (ใหม่)
cp -R .claude/worktrees/agitated-rhodes-4dd891/src .
cp -R .claude/worktrees/agitated-rhodes-4dd891/prisma .
cp -R .claude/worktrees/agitated-rhodes-4dd891/session24 .

# 2. Run Prisma migration (creates SQL + applies to DB)
npx prisma migrate dev --name add_revenue_permissions

# 3. Type check
npx tsc --noEmit

# 4. Smoke test (ดู checklist ด้านล่าง)
npm run dev

# 5. Commit + push
git add src prisma session24
git commit -m 'feat(S24): Phase 1 — Billings CRUD + recordPayment + Q→B convert + revenue permissions migration'
git push
```

⚠️ **Migration หมายเหตุ:** `prisma migrate dev` จะ:
- Detect schema diff
- สร้างไฟล์ `prisma/migrations/{timestamp}_add_revenue_permissions/migration.sql`
- Apply migration เข้า DB (Supabase)
- Regen Prisma client

ถ้าเจอ "drift detected" warning → reply `y` เพื่อ apply (ไม่มี data ใน 4 columns ใหม่ — safe)

---

## ✅ Smoke checklist S24 P1

### A. Permissions ขยาย revenue group (Pre-req)
- [ ] /permissions → admin ดูได้ → เห็น group "รายได้" ใต้ "รายการจ่าย" + 4 toggles
- [ ] Toggle manageCustomers ของ user manager คนอื่น → ON/OFF ได้ + isCustom badge แสดง
- [ ] รีเซ็ตเป็น default → กลับเป็น role-default

### B. /billings list (empty)
- [ ] /billings → empty list message + ปุ่ม "+ สร้างใบวางบิล"
- [ ] sidebar "ใบวางบิล" visible

### C. สร้าง billing โดยตรง
- [ ] /billings/new → เลือกลูกค้าที่มี DefaultWHTPercent > 0 → WHT% auto-fill
- [ ] เพิ่ม 2-3 lines + toggle VAT exclusive
- [ ] Live totals: subtotal/VAT/grandTotal/WHT/amountReceivable
- [ ] บันทึก → redirect /billings/[id] + DocNumber = `BIL-2026-0001`

### D. State + record payment
- [ ] ส่ง → status = sent
- [ ] บันทึกรับเงิน partial (< grandTotal) → status = partial + balance ลด
- [ ] บันทึกรับเงิน อีก → ถ้าครบ → status = paid
- [ ] Recordpayment เกิน balance → error
- [ ] /billings/[id]/edit (status = sent) → block "แก้ไขไม่ได้"
- [ ] Void draft → status = void

### E. Convert quotation → billing (สำคัญสุด)
- [ ] /quotations → สร้างใบเสนอราคาใหม่ → ส่ง → ลูกค้ายืนยัน → status = accepted
- [ ] กดปุ่ม "→ สร้างใบวางบิล" → modal เด้ง
- [ ] กรอก dueDate + whtPercent → กด "สร้างใบวางบิล"
- [ ] Redirect ไป /billings/[newId]
- [ ] Quotation เดิม → status = converted (ปุ่มทั้งหมดหายไป)
- [ ] /billings/[newId] → snapshot ลูกค้าจาก quotation + lines เหมือนเป๊ะ + sourceQuotationId แสดง link กลับ
- [ ] หลัง convert: ลอง convert ซ้ำ → throw error (status ≠ accepted)

### F. Cross-cutting
- [ ] Sheet "Billings" + "BillingLines" auto-create + headers ครบ
- [ ] AuditLog: เปิด Prisma Studio → audit_log มี entries: billing.create / send / recordPayment / void + quotation.converted
- [ ] Free plan user: redirect ที่ /billings + /billings/new

---

## ⚠️ Known limitations / Watch out

1. **🟡 PDF ยังไม่ทำ** — /billings/[id] + /quotations/[id] ปุ่ม "📄 PDF" disabled. **S24 Phase 2** หรือ S25
2. **🟡 ใบกำกับภาษี (TaxInvoice) ยังไม่ทำ** — S25
3. **🟡 ไม่มี BillingPayments tab** — recordPayment เก็บใน Billing row (PaidAmount + PaidDate + PaymentMethod + BankAccountID). Phase 2 ถ้า partial payment เยอะ ค่อยแยก tab (design doc Q6)
4. **🟡 BankAccountID ใน recordPayment** — ยังไม่ link CompanyBanks dropdown — กรอกเป็น free string. UI ปรับใน S24 P2
5. **🟡 Migration drift warning** — ถ้า DB schema มีคนแก้นอก Prisma → migrate dev จะ warn. Reply `y` apply ได้ (4 columns ใหม่ไม่ shadow ของเดิม)

### Carry-forward
- 🟡 WHT Phase 2 polish — รอ screenshot
- 🟡 Sidebar "รายงาน ภพ.30" rename — ทำ S25

---

## 🎯 S24 Phase 2 / S25 — งานต่อ

### S24 Phase 2 (เลือกได้ — defer หรือทำต่อ)
- PDF Quotation + Billing (@react-pdf/renderer + IBM Plex Sans Thai)
- BankAccountID dropdown ใน recordPayment (load CompanyBanks)
- /billings/[id]/edit ขยาย: รับ payment list view (ดู audit log)

### S25 Tax Invoices + VAT Phase 2
- TAX_INVOICES + TAX_INVOICE_LINES tabs (design doc 4.7/4.8)
- taxInvoice.router.ts — `issue` (sequential numbering!) + void
- Billing → TaxInvoice convert (similar to convertToBilling)
- Quotation → TaxInvoice direct convert (cash sale)
- /tax-invoices page (locked layout post-issue)
- PDF for TI (RD-compliant layout)
- VAT Phase 2: report.vatSales + report.vat30 procedures
- /reports/vat30 page (3-tab — ซื้อ/ขาย/สรุป)

---

## 📊 Phase status (after S24 P1)

| Phase | สถานะ |
|-------|-------|
| รายได้ — Customers + DocPrefix | ✅ S23 P1 |
| รายได้ — Quotations | ✅ S23 P2 |
| รายได้ — Billings + recordPayment + Q→B convert | ✅ **S24 P1** ✨ |
| รายได้ — PDF (Quotation + Billing) | ❌ S24 P2 |
| รายได้ — Tax Invoices + VAT P2 | ❌ S25 |
| Revenue permission keys (Prisma) | ✅ **S24 migration** ✨ |

---

*Handoff by Claude — S24 Phase 1 complete — 2026-05-03*
