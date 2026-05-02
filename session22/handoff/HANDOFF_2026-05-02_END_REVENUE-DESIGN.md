# Session 22 → Session 23 — Handoff (FINAL)

> **Created:** 2026-05-02 (end of Session 22)
> **Reason:** S22 = "รายได้" foundation design (Track B). No code changes — design doc only
> **Repo:** `~/Code/Aim Expense V2/aim-expense`
> **Worktree:** `.claude/worktrees/nostalgic-jemison-0ee440`
> **Status:** ✅ Approved by พี่ 2026-05-02 — 8 decisions resolved, ready for S23

---

## 🔴 อ่านก่อนเริ่มทำงานทุกครั้ง

1. **`SYSTEM_REQUIREMENTS.md`** ← Single Source of Truth (4 principles)
2. **`session22/design/REVENUE_FOUNDATION_DESIGN.md`** ← S22 deliverable — Revenue module schema + state machine + permission keys + roadmap
3. **`session21/handoff/HANDOFF_2026-05-02_END_VAT-PURCHASE.md`** ← S21 (VAT Phase 1 + /settings/google + /permissions)
4. **`session20/handoff/HANDOFF_2026-04-26_END_WHT-PHASE2.md`** ← S20 (WHT polish ที่ค้าง)

---

## 🎯 ที่ทำใน Session 22

### ✅ Track B — รายได้ Foundation Design (only deliverable)

**Decision:** Track A (WHT polish) + Track C (smoke test S21) ตัดออก
- พี่ confirm S21 ใช้งานได้จริงแล้ว → C ไม่จำเป็น
- A รอ screenshot จากพี่ — Defer ไป S23+ ตอนพี่ส่ง screenshot ใบสรุป ภงด.3/53

**สิ่งที่ทำ:**
1. Read SYSTEM_REQUIREMENTS.md (4 principles) + S21 handoff
2. Survey existing patterns:
   - `src/server/services/google-sheets.service.ts` — SHEET_TABS / SHEET_HEADERS / GoogleSheetsService class + auto-migration
   - `src/types/permissions.ts` — 14 keys + role defaults + groups
   - `src/components/layout/sidebar.tsx` — NAV_GROUPS + permission gating
   - `src/server/routers/payee.router.ts` — write procedure pattern (permissionProcedure + appendRowByHeaders + AuditLog)
   - `src/server/routers/report.router.ts:vat` — VAT Phase 1 read-only aggregation pattern
3. เขียน design doc 16 sections ที่ `session22/design/REVENUE_FOUNDATION_DESIGN.md` (~600 บรรทัด)

### Design highlights

#### Sheets schema — 6 tabs ใหม่ + 1 customers tab

```
CUSTOMERS                — ลูกค้า (parallel ของ Payees)
QUOTATIONS               — header (1 row/quotation)
QUOTATION_LINES          — line items (N rows/quotation)
BILLINGS                 — header
BILLING_LINES            — line items
TAX_INVOICES             — header (sequential DocNumber!)
TAX_INVOICE_LINES        — line items
```

**Pattern decision:** Header + Lines split (Option B) — Sheets-friendly, multi-line items real-world common

#### State machines

```
Quotation:    draft → sent → accepted → converted (linked) | rejected | void  (expired = derived)
Billing:      draft → sent → partial → paid | overdue (derived) | void
TaxInvoice:   draft → issued → void (compliance: sequential DocNumber!)
```

#### Permission keys (14 → 18)

```
manageCustomers      — admin/manager/accountant
manageQuotations     — admin/manager/accountant
manageBillings       — admin/manager/accountant
manageTaxInvoices    — admin/accountant only (compliance-sensitive)
```

+ new permission group `revenue`

#### Plan gating: `pro+` (consistent with VAT/P&L)

#### Sidebar plan
- "รายได้" group → เพิ่ม `permission` key ทุก item
- "ข้อมูลหลัก" → เพิ่ม "ลูกค้า" (`/customers`)
- "รายงาน" → rename "ภพ.30" → "รายงานภาษีซื้อ (ภ.พ.30)"
- After Phase 2: เพิ่ม "ภ.พ.30 — สรุปประจำเดือน" (`/reports/vat30`)

#### VAT Phase 2 plan
- `report.vatSales` — aggregate output VAT จาก TaxInvoices
- `report.vat30` — Combined Output + Input + Net
- `/reports/vat30` 3-tab page

#### Implementation roadmap

| Session | Scope |
|---------|-------|
| **S23** | Customers + Quotations (foundation) — 4 permission keys + revenue group + sheets schema + 2 routers + 2 pages + plan gate |
| **S24** | Billings + state transitions + recordPayment + Quotation→Billing convert + PDF basic |
| **S25** | TaxInvoices + sequential numbering + Billing→TI convert + RD-compliant PDF + VAT Phase 2 (report.vatSales + report.vat30 + /reports/vat30) |

---

## 📦 Files changed

```
NEW  session22/design/REVENUE_FOUNDATION_DESIGN.md     (~600 lines)
NEW  session22/handoff/HANDOFF_2026-05-02_END_REVENUE-DESIGN.md  (this file)
```

**ไม่มี code change** — design only, no commit needed

---

## ✅ Resolved Decisions (approved 2026-05-02)

ดูรายละเอียดใน design doc section 13. สรุป:

| # | Decision | สถานะ |
|---|----------|-------|
| 1 | `Customer.IsVAT` = **info-only** | ✅ |
| 2 | `PaymentMethod` = **enum** (transfer/cash/cheque/creditCard/other) | ✅ |
| 3 | `PaymentTerms` = **free text + dropdown defaults** (NET 0/15/30/60/90) | ✅ |
| 4 | `WHTPercent` Billing override = **ได้** (default จาก Customer) | ✅ |
| 5 | `Quotation.EventID` = **optional** | ✅ |
| 6 | Received payments = **MVP ใน Billing row** (Phase 2 add tab ถ้าเยอะ) | ✅ |
| 7 | DocNumber prefix = **customizable from MVP** (Config tab + /settings/org UI) | 🔄 changed |
| 8 | TaxInvoice.DocDate = **±7 วัน** + warn + block future | ✅ |

**Q7 changed scope:** ไม่ defer Phase 2 — ทำ customizable prefix ตั้งแต่ S23 (เพิ่ม helper `getDocPrefix` + `computeNextDocNumber` ใน `src/server/lib/doc-number.ts` + section "เลขที่เอกสาร" ใน /settings/org). ดู design doc section 13.1

---

## 🚀 Commands พี่ทำก่อนปิด S22

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
rm -f .git/index.lock

# Copy design doc + handoff จาก worktree → main repo
cp -r .claude/worktrees/nostalgic-jemison-0ee440/session22 .

# Commit (single-line message!)
git add session22
git commit -m 'docs(S22): รายได้ foundation design — Quotations/Billings/TaxInvoices schema + state machine + permission keys roadmap'
git push
```

**ไม่มี dev server start / type check** — pure documentation

---

## ⚠️ Known Issues / Watch Out (carry-forward)

ทั้งหมดยกมาจาก S21 + S20 ที่ยังไม่ปลด:

1. **🟡 WHT Phase 2 ใบสรุป polish** — ค้างจาก S20. รอ screenshot จากพี่ → fix CSS
2. **🟡 Smoke test ใบแนบ ภงด.53 + ใบสรุปทั้ง 2** — ค้างจาก S20
3. **🟡 Sidebar label "รายงาน ภพ.30"** — rename เป็น "รายงานภาษีซื้อ (ภ.พ.30)" พร้อม VAT Phase 2
4. **🟡 Prisma 5.22 → 7.8** — อย่า upgrade (S25+ tech debt)
5. **🟡 Single-line commit messages** — ห้าม multi-line
6. **🟡 Cowork sandbox** — ต้อง copy worktree → main repo
7. **🟡 git index.lock** — `rm -f .git/index.lock` ถ้าค้าง

---

## 🔋 Environment State (จบ S22)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Branch:          claude/nostalgic-jemison-0ee440 (worktree)
Main HEAD:       823a69a — S21 commit pushed
Vercel:          Hobby (downgraded 2026-05-02)
Type check:      n/a (no code change)
Smoke test:      n/a
DB connection:   ✅ (no schema change)
```

### Phase status (carry-forward)

| Phase | สถานะ | หมายเหตุ |
|-------|-------|----------|
| Phase 4 Reports WHT — Phase 1 | ✅ 100% | S19 |
| Phase 4 Reports WHT — Phase 2 (PDF 4 forms) | 🟡 95% | S20 — ใบสรุป polish ค้าง |
| Phase 4 Reports VAT — Phase 1 (ภาษีซื้อ) | ✅ 100% | S21 |
| Phase 4 Reports VAT — Phase 2 (ภาษีขาย + ภพ.30 ทั้งใบ) | ❌ 0% | รอ tax invoice → S25 |
| Settings → Google | ✅ 100% | S21 |
| Settings → Permissions | ✅ 100% | S21 |
| Settings → Billing | ❌ 0% | Phase 6 — รอ Stripe |
| **รายได้ Foundation Design** | ✅ 100% | **S22** ✨ |
| รายได้ Implementation (Quotations/Billings/TaxInvoices) | ❌ 0% | S23-25 |
| Phase 4 Inactive Payees + Audit Logs UI | ❌ 0% | S22+ pending |
| Phase 4 Dashboard role-specific | ❌ 0% | S24+ |

---

## 🎯 งาน Session 23 — Priority

✅ **Design approved + 8 decisions resolved** — start implement ได้เลย

### 🚀 ลำดับงาน:

1. **S23 implementation: Customers + Quotations + DocPrefix config**
   - 4 permission keys + role default + revenue group
   - Customers tab + customer.router.ts + /customers page
   - Quotations + QuotationLines tabs + quotation.router.ts + /quotations page + form
   - **Q7 customizable DocNumber prefix:**
     - `src/server/lib/doc-number.ts` — `getDocPrefix` + `computeNextDocNumber`
     - org.router.ts → `updateDocPrefixes` mutation (admin-only)
     - /settings/org → "เลขที่เอกสาร" section (3 prefix inputs)
   - Sidebar gate + plan gate (pro+)
   - Audit logs full coverage
2. **(Optional) WHT Phase 2 polish** — ถ้าพี่ส่ง screenshot ใบสรุปมา
3. **(Optional) Smoke test ใบแนบ ภงด.53** — ค้างจาก S20

---

## 📋 User & Org info (พี่)

```
User:
  id              = 333d8b87-8b59-492f-b684-ee41c57768f8
  email           = dev@aimexpense.com
  lineUserId      = Ua42c7d7729c56f8eab021918c168761c
  lineDisplayName = AoR

Org:
  id   = 32e5a820-ddb1-4850-95f3-b226d4e3a3e2
  name = บริษัท อาร์โต จำกัด
  slug = org-1776216850926
```

---

## 🗺️ Roadmap ปิด project (~5-7 sessions เหลือ)

- **Sprint A** (เก็บงาน Reports + WHT polish): S22 = design ✅ / S23-25 = รายได้ implement
- **Sprint B** (รายได้ flow): **S23-25** Quotations/Billings/TaxInvoices + VAT Phase 2
- **Sprint C** (Big features): S26-28 Billing/Subscription (Stripe)
- **Sprint D**: S29 Polish + tech debt, S30 Pre-launch QA

---

*Handoff by Claude — Session 22 end — 2026-05-02*
