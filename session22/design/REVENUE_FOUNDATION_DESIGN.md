# 💰 Revenue Foundation — Design Doc (S22)

> **Created:** 2026-05-02 (Session 22)
> **Author:** Aim (with Claude)
> **Status:** Design — pending approval before implementation in S23-25
> **Scope:** New "รายได้" module — Quotations / Billings / TaxInvoices + Customers
> **Aligned with:** SYSTEM_REQUIREMENTS.md (4 principles), S21 patterns

---

## 1. Goals & Non-goals

### Goals

1. **Foundation only** — schema + state machine + permission keys + sidebar plan, no implementation
2. ครอบคลุมทั้ง 3 documents ที่เป็น sales-side: ใบเสนอราคา → ใบวางบิล → ใบกำกับภาษี
3. รองรับการ "สร้างจาก existing record" (quotation → billing, billing → tax invoice)
4. เตรียมทาง VAT Phase 2 (ภพ.30 ทั้งใบ — Output + Input VAT)
5. ยึด SYSTEM_REQUIREMENTS หลัก 4 ข้อ — ห้ามเก็บ business data ใน Prisma

### Non-goals (S22)

- ❌ Implementation (defer S23-S25)
- ❌ PDF/document templates (defer — เก็บไว้ออกแบบช่วง implement จริง)
- ❌ Recurring billings / subscription invoices (post-MVP)
- ❌ Multi-currency (MVP = THB only)
- ❌ E-Tax invoice integration (XML signing / RD upload — post-MVP, S30+)
- ❌ Credit notes / debit notes (ใบลดหนี้/ใบเพิ่มหนี้) — Phase 2 ของ tax invoices

---

## 2. Domain Glossary (Thai accounting context)

| ไทย | Eng | สรุป | เกี่ยวกับภาษี? |
|-----|-----|------|---------------|
| ใบเสนอราคา | Quotation | เสนอราคา ยังไม่ผูกพัน | ❌ ไม่มีผลภาษี |
| ใบสั่งซื้อ | Purchase Order (PO) | ลูกค้าตอบกลับสั่งซื้อ | ❌ ไม่มีผลภาษี |
| ใบวางบิล | Billing Note | แจ้งเรียกเก็บ — มักรวม ใบแจ้งหนี้ ในระบบ SME | ❌ ไม่มีผลภาษีโดยตรง |
| ใบแจ้งหนี้ | Invoice | เอกสารเรียกเก็บเงิน | ❌ |
| ใบกำกับภาษี | Tax Invoice | **มีผลภาษี — ออก output VAT** | ✅ ภาษีขาย |
| ใบเสร็จรับเงิน | Receipt | ยืนยันรับเงินแล้ว | ✅ (combined: ใบกำกับภาษี/ใบเสร็จ) |
| ใบลดหนี้ | Credit Note | ลดยอด tax invoice | ✅ ลด output VAT |
| ใบเพิ่มหนี้ | Debit Note | เพิ่มยอด tax invoice | ✅ เพิ่ม output VAT |

**MVP scope:** Quotation / Billing / TaxInvoice เท่านั้น
- ใบวางบิล ≈ ใบแจ้งหนี้ (รวมเป็นเอกสารเดียว — เรียก "Billing")
- ใบเสร็จรับเงิน issue ตอนรับเงิน — Phase 2 (defer)
- Credit/Debit notes — Phase 2 (defer)

---

## 3. State Machines

### 3.1 Quotation (ใบเสนอราคา)

```
draft ──► sent ──► accepted ──► converted (= มี billing/tax-invoice ที่ link มา)
                ├► rejected
                ├► expired (auto: validUntil < today)
                └► void
```

| สถานะ | คำอธิบาย | อนุญาตให้แก้? |
|-------|----------|---------------|
| draft | ยังไม่ส่งลูกค้า | ✅ แก้ได้หมด |
| sent | ส่งลูกค้าแล้ว (gen PDF + snapshot line items) | ❌ snapshot lock |
| accepted | ลูกค้ายืนยันสั่งซื้อ | ❌ |
| rejected | ลูกค้าปฏิเสธ | ❌ |
| expired | เกิน validUntil (auto-derived in UI, ไม่เก็บใน Sheet) | ❌ |
| converted | สร้าง billing/tax-invoice แล้ว (ยังเป็น sub-state ของ accepted) | ❌ |
| void | ยกเลิก | ❌ (read-only) |

**Note:** `expired` ไม่ใช่ status field จริง — UI compute จาก `validUntil < today && status === "sent"`.

### 3.2 Billing (ใบวางบิล/ใบแจ้งหนี้)

```
draft ──► sent ──► partial ──┐
                             ├──► paid ──► (closed)
                             ├──► overdue (auto: dueDate < today && balance > 0)
                             └──► void
```

| สถานะ | คำอธิบาย | อนุญาตให้แก้? |
|-------|----------|---------------|
| draft | ร่าง | ✅ |
| sent | ส่งลูกค้าแล้ว | ❌ snapshot |
| partial | ลูกค้าจ่ายบางส่วน (PaidAmount > 0 && < GrandTotal) | ❌ amount fields |
| paid | จ่ายครบ (PaidAmount === GrandTotal) | ❌ |
| overdue | UI auto: dueDate < today | ❌ |
| void | ยกเลิก (ก่อน issue tax invoice เท่านั้น) | ❌ |

**Linkage:** `SourceQuotationID` — ถ้า billing นี้สร้างจาก quotation (optional — รับ standalone ได้ด้วย)

### 3.3 Tax Invoice (ใบกำกับภาษี)

```
draft ──► issued ──► void (= ออก credit note ทดแทน)
```

⚠️ **Compliance critical:** Tax invoice numbers ต้องเรียงต่อเนื่อง (sequential) ห้ามข้าม + เก็บแม้ void

| สถานะ | คำอธิบาย | อนุญาตให้แก้? |
|-------|----------|---------------|
| draft | ร่าง — ยังไม่กิน sequence number | ✅ |
| issued | ออกเลขใบกำกับภาษีแล้ว (gen DocNumber + lock) | ❌ |
| void | ยกเลิก — ต้องมี linked credit note (Phase 2) | ❌ read-only |

**Linkage:** `SourceBillingID` หรือ `SourceQuotationID` (optional — รับ direct sale ได้)

**Sequential numbering rule:** เลขใบกำกับภาษีคำนวณ on-the-fly จาก `MAX(DocNumber where status=issued && year=YYYY) + 1` ตอน transition `draft → issued`. รับ collision risk ระดับ SME (single-user mostly).

### 3.4 Cross-document linkage (allowed combinations)

```
       ┌─────────────────────────────────────┐
       ▼                                     │
  Quotation ───┬──► Billing ────► Tax Invoice
               │                       ▲
               └───────────────────────┘
                  (direct: skip Billing)
```

**ทุก lineage allowed:**
- Q → B → TI (full flow)
- Q → TI (skip billing — common for ขายสด)
- B → TI (no preceding quotation — recurring/manual)
- TI standalone (cash sale)
- Q standalone (proposal, never converted)

---

## 4. Sheets Schema

### 4.1 Tab additions (extend `SHEET_TABS` in `google-sheets.service.ts`)

```typescript
export const SHEET_TABS = {
  // ... existing ...
  CUSTOMERS: "Customers",
  QUOTATIONS: "Quotations",
  QUOTATION_LINES: "QuotationLines",
  BILLINGS: "Billings",
  BILLING_LINES: "BillingLines",
  TAX_INVOICES: "TaxInvoices",
  TAX_INVOICE_LINES: "TaxInvoiceLines",
} as const;
```

**Rationale: Header + Lines split (Option B)**
- ทุกเอกสารมี **multiple line items** ในชีวิตจริง (ไม่ใช่ปริมาณเดียวเหมือน Payment row)
- Header tab = 1 row/document (totals, customer ref, status, etc.)
- Lines tab = N rows/document (description, qty, unit price, line total)
- ✅ Sheets human-readable (vs JSON in cell)
- ✅ Filterable per line (เช่น "วันนี้ขายอะไรบ้าง")
- ❌ Append + lines = 2 API calls per create (acceptable — tRPC mutation, not hot path)

### 4.2 `Customers` tab

ลูกค้า — parallel ของ `Payees` (ผู้รับเงินขาออก) — แยกชัดเจนเพราะ semantics ต่าง

```typescript
[SHEET_TABS.CUSTOMERS]: [
  "CustomerID",          // CUST-XXXX-XXXX
  "CustomerName",        // ชื่อลูกค้า / นิติบุคคล
  "TaxID",               // เลขผู้เสียภาษี 13 หลัก
  "BranchType",          // "HQ" | "Branch"
  "BranchNumber",        // 5 หลัก
  "IsVAT",               // TRUE/FALSE — ลูกค้าจดทะเบียน VAT? (= ออก tax invoice ให้ได้)
  "ContactPerson",       // ชื่อผู้ติดต่อ
  "Phone",
  "Email",
  "Address",             // ที่อยู่ตามทะเบียน (สำหรับ tax invoice)
  "BillingAddress",      // ที่อยู่จัดส่งใบวางบิล (default = Address)
  "PaymentTerms",        // "NET 30" | "NET 60" | "COD" | custom
  "DefaultWHTPercent",   // % ลูกค้าหัก ณ ที่จ่ายเรา (1/3/5%) — auto-fill ใน billing
  "Notes",
  "CreatedAt",
  "CreatedBy",
],
```

### 4.3 `Quotations` tab (header)

```typescript
[SHEET_TABS.QUOTATIONS]: [
  "QuotationID",          // QT-XXXX-XXXX (internal ID)
  "DocNumber",            // QT-2026-0001 (user-visible, sequential per year)
  "DocDate",              // YYYY-MM-DD — วันออกเอกสาร
  "ValidUntil",           // YYYY-MM-DD — ใช้ได้ถึง
  "CustomerID",
  "CustomerNameSnapshot", // snap จาก Customer.CustomerName ตอนออก (for immutable display)
  "CustomerTaxIdSnapshot",
  "CustomerAddressSnapshot",
  "Status",               // draft | sent | accepted | rejected | void | converted
  "EventID",              // (optional) link to internal Event/project
  "ProjectName",          // ชื่อโครงการ/งาน (text — ลูกค้าใช้)
  "Subtotal",             // ผลรวมก่อน VAT
  "DiscountAmount",       // ส่วนลดบาท
  "VATAmount",            // 7% ของ (Subtotal - Discount) — ถ้าออกแบบ inclusive=false
  "VATIncluded",          // TRUE = ราคาที่กรอกรวม VAT แล้ว / FALSE = บวก VAT จาก Subtotal
  "GrandTotal",           // ยอดรวมสุทธิ
  "Notes",                // หมายเหตุท้ายเอกสาร
  "Terms",                // เงื่อนไขการชำระ/การส่งมอบ
  "PreparedBy",           // ผู้จัดทำ (display name)
  "PreparedByUserId",
  "CreatedAt",
  "UpdatedAt",
  "PdfUrl",               // Drive URL ของ PDF ที่ระบบออก (Phase 2 — defer)
],
```

### 4.4 `QuotationLines` tab (line items)

```typescript
[SHEET_TABS.QUOTATION_LINES]: [
  "LineID",        // QTL-XXXX-XXXX
  "QuotationID",   // FK → Quotations.QuotationID
  "LineNumber",    // 1, 2, 3, ... (display order)
  "Description",
  "Quantity",
  "UnitPrice",
  "DiscountPercent", // ส่วนลดต่อบรรทัด %
  "LineTotal",       // = Quantity × UnitPrice × (1 - DiscountPercent/100)
  "Notes",
],
```

### 4.5 `Billings` tab (header)

```typescript
[SHEET_TABS.BILLINGS]: [
  "BillingID",            // BIL-XXXX-XXXX
  "DocNumber",            // BIL-2026-0001
  "DocDate",              // วันออก
  "DueDate",              // ครบกำหนด
  "CustomerID",
  "CustomerNameSnapshot",
  "CustomerTaxIdSnapshot",
  "CustomerAddressSnapshot",
  "SourceQuotationID",    // (optional) ถ้าสร้างจาก Quotation
  "EventID",              // optional
  "ProjectName",
  "Status",               // draft | sent | partial | paid | void
  "Subtotal",
  "DiscountAmount",
  "VATAmount",
  "VATIncluded",
  "WHTPercent",           // ลูกค้าหัก ณ ที่จ่ายเรากี่ % (0/1/3/5)
  "WHTAmount",            // = Subtotal × WHTPercent / 100
  "GrandTotal",           // Subtotal + VAT
  "AmountReceivable",     // GrandTotal - WHTAmount (= ยอดที่ลูกค้าจ่ายจริง)
  "PaidAmount",           // อัปเดตเมื่อรับเงิน (running)
  "PaidDate",             // วันรับเงินครั้งแรก/สุดท้าย
  "PaymentMethod",        // "transfer" | "cash" | "cheque"
  "BankAccountID",        // ref → CompanyBanks.CompanyBankID (ถ้าโอน)
  "Notes",
  "Terms",
  "PreparedBy",
  "PreparedByUserId",
  "CreatedAt",
  "UpdatedAt",
  "PdfUrl",
],
```

### 4.6 `BillingLines` tab

โครงสร้างเหมือน QuotationLines (FK = `BillingID`)

```typescript
[SHEET_TABS.BILLING_LINES]: [
  "LineID",
  "BillingID",
  "LineNumber",
  "Description",
  "Quantity",
  "UnitPrice",
  "DiscountPercent",
  "LineTotal",
  "Notes",
],
```

### 4.7 `TaxInvoices` tab (header)

```typescript
[SHEET_TABS.TAX_INVOICES]: [
  "TaxInvoiceID",         // TI-XXXX-XXXX
  "DocNumber",            // TI-2026-0001 (เลขใบกำกับภาษี — sequential!)
  "DocDate",              // วันออก = วันส่งมอบ/วันให้บริการเสร็จสิ้น
  "CustomerID",
  "CustomerNameSnapshot",
  "CustomerTaxIdSnapshot",
  "CustomerBranchSnapshot", // "00000" / "00001"
  "CustomerAddressSnapshot",
  "SourceBillingID",      // (optional)
  "SourceQuotationID",    // (optional — direct quotation→TI)
  "EventID",
  "ProjectName",
  "Status",               // draft | issued | void
  "Subtotal",             // ฐานภาษี (pre-VAT)
  "DiscountAmount",
  "VATAmount",            // ภาษีขาย (output VAT) ที่ออก
  "VATIncluded",
  "GrandTotal",
  "Notes",
  "PreparedBy",
  "PreparedByUserId",
  "IssuedAt",             // ISO timestamp ของการ issue (lock state)
  "VoidedAt",             // ถ้าถูก void
  "VoidReason",
  "CreditNoteID",         // (Phase 2) link to credit note ที่ทดแทน
  "CreatedAt",
  "UpdatedAt",
  "PdfUrl",
],
```

### 4.8 `TaxInvoiceLines` tab

```typescript
[SHEET_TABS.TAX_INVOICE_LINES]: [
  "LineID",
  "TaxInvoiceID",
  "LineNumber",
  "Description",
  "ExpenseNature",  // "goods" | "service" — สำหรับ ภพ.30 (กรอกแยก)
  "Quantity",
  "UnitPrice",
  "DiscountPercent",
  "LineTotal",
  "Notes",
],
```

### 4.9 Auto-migration support

ทุก tab ใหม่จะถูก auto-create โดย `ensureAllTabsExist()` ที่มีอยู่แล้ว — ไม่ต้องแก้ logic
- เรียกครั้งแรกที่ user ใช้ /quotations หรือ /billings → tabs โผล่อัตโนมัติ + headers ติด
- Existing orgs ไม่ break (auto-extend headers ที่ขาด)

---

## 5. Permission Keys

### 5.1 New keys

```typescript
// Add to src/types/permissions.ts
export interface Permissions {
  // ... existing 14 keys ...
  manageCustomers: boolean;     // CRUD ลูกค้า (master data)
  manageQuotations: boolean;    // CRUD ใบเสนอราคา
  manageBillings: boolean;      // CRUD ใบวางบิล + record received payments
  manageTaxInvoices: boolean;   // CRUD ใบกำกับภาษี (issue + void)
}
```

**ขยายจาก 14 → 18 keys**

### 5.2 Default role mapping

| Permission | Admin | Manager | Accountant | Staff |
|-----------|-------|---------|-----------|-------|
| `manageCustomers` | ✅ | ✅ | ✅ | ❌ |
| `manageQuotations` | ✅ | ✅ | ✅ | ❌ |
| `manageBillings` | ✅ | ✅ | ✅ | ❌ |
| `manageTaxInvoices` | ✅ | ❌ | ✅ | ❌ |

**Rationale:**
- Manager — ดูแลโครงการ ออกใบเสนอราคา/วางบิลได้ แต่ tax invoice เป็น compliance — admin/accountant only
- Accountant — เป็น principal user ของฝั่งบัญชี ต้องทำได้ทุกอย่าง
- Staff — ไม่เข้าถึงการเงินขาย

### 5.3 Permission group (UI)

เพิ่ม group ใหม่ใน `PERMISSION_GROUPS`:

```typescript
revenue: {
  label: "รายได้",
  permissions: [
    "manageCustomers",
    "manageQuotations",
    "manageBillings",
    "manageTaxInvoices",
  ] as PermissionKey[],
},
```

---

## 6. Plan Gating

ฝั่ง subscription — เริ่มที่ `pro+` (มาตรฐานเดียวกับ VAT report / P&L per principle 4):

| Plan | รายได้ access |
|------|--------------|
| free | ❌ |
| basic | ❌ |
| **pro** | ✅ |
| business / max / enterprise | ✅ |

ใช้ pattern เดียวกับ /reports/vat:
```typescript
const subscription = await prisma.subscription.findUnique({ where: { orgId } });
const allowedPlans = ["pro", "business", "max", "enterprise"];
if (!allowedPlans.includes(subscription?.plan || "free")) {
  redirect("/dashboard?upgrade=required");
}
```

---

## 7. Sidebar Plan

### 7.1 Existing "รายได้" group — เพิ่ม permission gate

```diff
  {
    label: "รายได้",
    items: [
      {
        label: "ใบเสนอราคา",
        href: "/quotations",
        icon: "📜",
+       permission: "manageQuotations",
      },
      {
        label: "ใบวางบิล",
        href: "/billings",
        icon: "🧾",
+       permission: "manageBillings",
      },
      {
        label: "ใบกำกับภาษี",
        href: "/tax-invoices",
        icon: "🧮",
+       permission: "manageTaxInvoices",
      },
    ],
  },
```

### 7.2 "ข้อมูลหลัก" — เพิ่ม "ลูกค้า"

```diff
  {
    label: "ข้อมูลหลัก",
    items: [
      {
        label: "ผู้รับเงิน",
        href: "/payees",
        icon: "👤",
        permission: "managePayees",
      },
+     {
+       label: "ลูกค้า",
+       href: "/customers",
+       icon: "🏢",
+       permission: "manageCustomers",
+     },
      {
        label: "รายชื่อธนาคาร",
        ...
      },
    ],
  },
```

### 7.3 "รายงาน" — rename + เพิ่มเมื่อ Phase 2 ready

```diff
- label: "รายงาน ภพ.30",
- href: "/reports/vat",
+ label: "รายงานภาษีซื้อ (ภ.พ.30)",
+ href: "/reports/vat",   // Phase 1 ปัจจุบัน
```

หลัง VAT Phase 2 ออก:
```diff
+ {
+   label: "ภ.พ.30 — สรุปประจำเดือน",
+   href: "/reports/vat30",
+   icon: "🧾",
+   permission: "viewReports",
+ },
```

---

## 8. tRPC Router Plan (S23-25 implement)

### 8.1 New routers

| File | Procedures |
|------|-----------|
| `src/server/routers/customer.router.ts` | list / getById / create / update / delete |
| `src/server/routers/quotation.router.ts` | list / getById / create / update / send / accept / reject / void / convertToBilling / convertToTaxInvoice |
| `src/server/routers/billing.router.ts` | list / getById / create / update / send / recordPayment / void / convertToTaxInvoice |
| `src/server/routers/taxInvoice.router.ts` | list / getById / create / update / issue / void / nextDocNumber |

### 8.2 Pattern for all writes

```typescript
create: permissionProcedure("manageQuotations")
  .input(QuotationInputSchema)
  .mutation(async ({ ctx, input }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    const quotationId = GoogleSheetsService.generateId("QT");
    const docNumber = await computeNextDocNumber(sheets, "QT", year);

    // Snapshot customer
    const customer = await sheets.getById(SHEET_TABS.CUSTOMERS, "CustomerID", input.customerId);
    if (!customer) throw new Error("ไม่พบลูกค้า");

    // 1. Header
    await sheets.appendRowByHeaders(SHEET_TABS.QUOTATIONS, {
      QuotationID: quotationId,
      DocNumber: docNumber,
      ...computeTotals(input.lines, input.vatIncluded),
      CustomerNameSnapshot: customer.CustomerName,
      // ... etc
    });

    // 2. Lines
    for (const [idx, line] of input.lines.entries()) {
      await sheets.appendRowByHeaders(SHEET_TABS.QUOTATION_LINES, {
        LineID: GoogleSheetsService.generateId("QTL"),
        QuotationID: quotationId,
        LineNumber: idx + 1,
        ...line,
      });
    }

    // 3. Audit
    await prisma.auditLog.create({
      data: {
        orgId: ctx.org.orgId,
        userId: ctx.session.userId,
        action: "create",
        entityType: "quotation",
        entityRef: quotationId,
        summary: `สร้างใบเสนอราคา ${docNumber}`,
      },
    });

    return { success: true, quotationId, docNumber };
  }),
```

### 8.3 State transition guards

ทุก state transition (sent / accepted / void / issued / etc.) → procedure แยก ไม่ใช่ generic update:

```typescript
issue: permissionProcedure("manageTaxInvoices")
  .input(z.object({ taxInvoiceId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    const ti = await sheets.getById(SHEET_TABS.TAX_INVOICES, "TaxInvoiceID", input.taxInvoiceId);
    if (!ti) throw new Error("ไม่พบใบกำกับภาษี");
    if (ti.Status !== "draft") throw new Error(`ไม่สามารถ issue ได้ (state: ${ti.Status})`);

    const docNumber = await computeNextTaxInvoiceNumber(sheets);
    const issuedAt = new Date().toISOString();

    await sheets.updateById(SHEET_TABS.TAX_INVOICES, "TaxInvoiceID", input.taxInvoiceId, {
      Status: "issued",
      DocNumber: docNumber,
      IssuedAt: issuedAt,
    });

    await prisma.auditLog.create({...});
    return { success: true, docNumber };
  }),
```

### 8.4 Conversion procedure (quotation → billing)

```typescript
convertToBilling: permissionProcedure("manageBillings")
  .input(z.object({
    quotationId: z.string(),
    dueDate: z.string(),
    overrideLines: LineInput.array().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    const q = await sheets.getById(SHEET_TABS.QUOTATIONS, "QuotationID", input.quotationId);
    if (!q || q.Status !== "accepted") throw new Error("ใบเสนอราคาต้องอยู่ใน status accepted");

    const lines = input.overrideLines || await getLines(sheets, q.QuotationID);
    const billingId = GoogleSheetsService.generateId("BIL");

    // copy header w/ SourceQuotationID
    await sheets.appendRowByHeaders(SHEET_TABS.BILLINGS, {
      BillingID: billingId,
      SourceQuotationID: q.QuotationID,
      // ... carry-over snapshots ...
    });
    // copy lines
    // mark quotation Status: "converted"
    // audit log
    return { success: true, billingId };
  }),
```

### 8.5 Mount in `_app.ts`

```diff
import { reportRouter } from "./report.router";
+ import { customerRouter } from "./customer.router";
+ import { quotationRouter } from "./quotation.router";
+ import { billingRouter } from "./billing.router";
+ import { taxInvoiceRouter } from "./taxInvoice.router";

export const appRouter = router({
  // ...
  report: reportRouter,
+ customer: customerRouter,
+ quotation: quotationRouter,
+ billing: billingRouter,
+ taxInvoice: taxInvoiceRouter,
});
```

---

## 9. UI Page Plan (S23-25)

| Route | Pattern reference | Notes |
|-------|------------------|-------|
| `/customers` | `/payees/page.tsx` | DataTable + form modal — ตรงๆ |
| `/quotations` | `/payments/page.tsx` | List + filter (status/customer/date) + create modal |
| `/quotations/new` | new modal/page | Multi-step: customer → lines → terms → preview |
| `/quotations/[id]` | new — detail view | Read state, transitions buttons (sent/accepted/etc.) |
| `/billings` | `/quotations` mirror | + recordPayment action |
| `/billings/[id]` | mirror | + payment received button |
| `/tax-invoices` | `/billings` mirror | + issue (locked once issued) |
| `/tax-invoices/[id]` | mirror | + void button (admin only) |

### Form complexity

ใบเสนอราคา/วางบิล/ใบกำกับ form ต้องมี:
- Customer picker (with "+ เพิ่มลูกค้าใหม่" inline)
- Line items dynamic table (add/remove rows)
- Auto-compute Subtotal / VAT / GrandTotal as user types
- Toggle VAT inclusive/exclusive
- Notes + Terms text areas
- Preview pane (right side or modal)

ใช้ pattern `payment-prep/payment-prep-client.tsx` (multi-step wizard) เป็นต้นแบบ — มี complex form pattern อยู่แล้ว

---

## 10. PDF Templates (defer — กำหนดช่วง implement)

ตอน implement S23-25 ใช้ pattern เดียวกับ S20:
- @react-pdf/renderer
- IBM Plex Sans Thai font (root layout)
- formatMoney (pure JS regex)
- A4 portrait — เอกสาร business standard

3 templates ต้องการ:
1. `QuotationPdf.tsx` — ใบเสนอราคา (header logo + customer + line table + total + signature)
2. `BillingPdf.tsx` — ใบวางบิล (similar + payment terms + bank account section)
3. `TaxInvoicePdf.tsx` — ใบกำกับภาษี (mandated layout per RD spec — เลขผู้เสียภาษี / สาขา / VAT breakdown ชัด)

---

## 11. VAT Phase 2 Plan (after TaxInvoice ready)

### 11.1 New procedure: `report.vatSales`

```typescript
vatSales: orgProcedure
  .input(z.object({ from: z.string(), to: z.string() }))
  .query(async ({ ctx, input }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    const [taxInvoices, customers] = await Promise.all([
      sheets.getAll(SHEET_TABS.TAX_INVOICES),
      sheets.getAll(SHEET_TABS.CUSTOMERS),
    ]);
    // filter: status === "issued" + DocDate in range
    // aggregate: row per TI + customer ref + VAT amount
    return { stats, rows };
  }),
```

### 11.2 Combined `report.vat30` (full ภพ.30)

```typescript
vat30: orgProcedure
  .input(z.object({ year: z.number(), month: z.number() }))
  .query(async ({ ctx, input }) => {
    const [purchase, sales] = await Promise.all([
      this.vat({ from, to, dateField: "receiptDate" }),
      this.vatSales({ from, to }),
    ]);
    return {
      output: { totalBase: sales.stats.totalBase, totalVAT: sales.stats.totalVAT },
      input: { totalBase: purchase.stats.totalBase, totalVAT: purchase.stats.totalVAT },
      net: sales.stats.totalVAT - purchase.stats.totalVAT, // > 0 = ต้องจ่าย / < 0 = สะสมเครดิต
      sales: sales.rows,
      purchases: purchase.rows,
    };
  }),
```

### 11.3 New page: `/reports/vat30`

มี 3 tab:
- ภาษีซื้อ (= ปัจจุบัน /reports/vat)
- ภาษีขาย (จาก vatSales)
- สรุป ภพ.30 (Net + grand totals)

---

## 12. Risk Register

| # | Risk | Severity | Mitigation |
|---|------|----------|-----------|
| 1 | **Tax invoice number gaps** — concurrent issue ทำเลข duplicate / skip | 🔴 High | Pessimistic check on `issue`: read all → max+1 → write. Single-user SME = low practical risk. Phase 2 add row-level mutex via Sheets revision API |
| 2 | **Header/Lines split = 2 writes** — partial failure → orphan lines | 🟡 Med | Wrap in try/catch — if line write fails, immediately delete header. Audit log แยก action ต่อไปดูได้ |
| 3 | **Customer.Address mutation** affects historical docs | 🟡 Med | ใช้ snapshot pattern (CustomerAddressSnapshot) เหมือน VendorBranchInfo ใน Payments |
| 4 | **VAT inclusive vs exclusive** — user mistake → wrong total | 🟡 Med | UI: explicit toggle + live preview of breakdown |
| 5 | **Sheets API quota** — 6 new tabs × N orgs × N rows | 🟢 Low | Existing pattern handles 6 tabs already; per-org scaling fine |
| 6 | **Compliance: ใบกำกับ format** — RD spec strict (ที่อยู่ครบ / เลขสาขา / ฯลฯ) | 🔴 High | กำหนด required fields ใน Customer schema (TaxID + BranchType + BranchNumber) — block issue if missing |
| 7 | **Document numbering reset across years** — QT-2026 → QT-2027 | 🟡 Med | computeNextDocNumber filter by year — reset index per calendar year |
| 8 | **Plan downgrade** — pro → free with existing quotations | 🟢 Low | ซ่อน menu (already pattern) — data ใน Sheets ของ user เอง ยังอยู่ |

---

## 13. Open Questions (need พี่ confirm before S23)

1. **`Customer.IsVAT` semantics** — ลูกค้าจดทะเบียน VAT เพื่ออะไร? เช็ค block ออก tax invoice ให้ลูกค้าที่ไม่จด? หรือ just info?
   - **ข้อเสนอ:** info-only field. ตามกฎหมายเราออก TI ให้ใครก็ได้ — IsVAT ของลูกค้าไม่ block

2. **`PaymentMethod` ใน Billing** — ต้อง enum หรือ free text?
   - **ข้อเสนอ:** enum `["transfer", "cash", "cheque", "creditCard", "other"]`

3. **`PaymentTerms` ใน Customer** — fixed enum หรือ free text?
   - **ข้อเสนอ:** free text (รองรับ "NET 30 หลังส่งของ" เป็นต้น) — แต่ default dropdown มี NET 0/15/30/60/90

4. **`WHTPercent` ใน Billing** — ถ้าลูกค้าหักจริงไม่เท่า DefaultWHTPercent?
   - **ข้อเสนอ:** override ได้ใน billing form. Default จาก Customer.DefaultWHTPercent — but editable

5. **Quotation linking to Event** — บังคับเลือก Event มั้ย?
   - **ข้อเสนอ:** optional. ฝั่ง expense งานคงต้องมี Event เพราะคุมงบ — ฝั่ง revenue บางทีขายตรงไม่ผ่าน event (e.g. ขายของ retail)

6. **Where to attach received payments?** — ในตอนนี้ `Billings.PaidAmount` คุมเอง ไม่มี Payment record แยก
   - **ข้อเสนอ:** MVP บันทึกใน Billing row เอง (PaidAmount + PaidDate). Phase 2 อาจมี `BillingPayments` tab ถ้า partial payment เยอะ

7. **Number prefix scheme** — QT/BIL/TI พอ หรือลูกค้าอยาก customize? (e.g. INV2026/0001 vs BL2026-001)
   - **ข้อเสนอ:** MVP fixed prefix. Phase 2 add `Config.DOC_PREFIX_QT/BIL/TI` overrides

8. **TaxInvoice.DocDate constraint** — RD requires "ภายในวันที่ส่งมอบ/ให้บริการเสร็จสิ้น" — เราบังคับ today only หรืออนุญาต backdate?
   - **ข้อเสนอ:** อนุญาต ±7 วัน — ใส่ warning ถ้า > 7 วันที่ผ่านมา (อาจติด audit). Block future date เด็ดขาด

---

## 14. Implementation Roadmap (S23-S25)

### S23 — Customers + Quotations (foundation)
- [ ] Add 4 permission keys + role default mapping
- [ ] Add `revenue` permission group
- [ ] Add Customers tab to SHEET_TABS + auto-migrate
- [ ] customer.router.ts — list/getById/create/update/delete
- [ ] /customers page (mirror /payees)
- [ ] Add Quotations + QuotationLines tabs
- [ ] quotation.router.ts — list/getById/create/update + send/accept/reject/void
- [ ] /quotations page + form (multi-step)
- [ ] Sidebar: gate รายได้ items + add ลูกค้า
- [ ] Plan gate (pro+) on /customers + /quotations

### S24 — Billings + state transitions + recordPayment
- [ ] Billings + BillingLines tabs
- [ ] billing.router.ts — full CRUD + transitions
- [ ] Quotation → Billing convert procedure
- [ ] /billings page + form + recordPayment modal
- [ ] PDF basic template — Quotation + Billing
- [ ] Audit log full coverage

### S25 — Tax Invoices + VAT Phase 2
- [ ] TaxInvoices + TaxInvoiceLines tabs
- [ ] taxInvoice.router.ts — issue (sequential numbering!) + void
- [ ] Billing → TaxInvoice convert
- [ ] Quotation → TaxInvoice direct convert
- [ ] /tax-invoices page (locked layout post-issue)
- [ ] PDF for TI (RD-compliant layout)
- [ ] VAT Phase 2: report.vatSales + report.vat30 procedures
- [ ] /reports/vat30 page (3-tab — ซื้อ/ขาย/สรุป)
- [ ] Sidebar rename "ภพ.30" → "รายงานภาษีซื้อ (ภ.พ.30)" + add VAT30 menu

### Total estimate: 3 sessions @ ~2-3 features/session

---

## 15. Compliance Checklist (Pre-Launch ก่อน real customer ใช้)

- [ ] ใบกำกับภาษี layout ผ่าน "ตัวอย่างใบกำกับภาษี" ของ RD
- [ ] เลขใบกำกับภาษี sequential — no gaps test
- [ ] เลขผู้เสียภาษีลูกค้า + เลขสาขา ครบในทุก issued TI
- [ ] วันที่ออก TI ห่างวันส่งมอบ ≤ 7 วัน (warn UI)
- [ ] Void TI ต้องมี audit + reason
- [ ] หากลูกค้าเป็นบุคคลธรรมดา (TaxID 13 หลัก = บัตร ปชช.) — ออก TI ได้เหมือนกัน

---

## 16. Approval

✅ พี่ approve schema + roadmap → ผม start S23 (Customers + Quotations)
🔄 ถ้ามีจุดอยากปรับ → ตอบใน open questions ข้อ 1-8 ด้านบน

---

*Design by Claude (S22) — for review by Aim before implementation*
