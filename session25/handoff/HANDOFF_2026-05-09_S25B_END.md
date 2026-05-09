# Session 25B → Session 26 — Handoff (FINAL)

> **Created:** 2026-05-09 (end of S25B)
> **Worktree:** `.claude/worktrees/compassionate-liskov-2bc32d`
> **Branch:** `main` (commit `df1868b`)
> **Type check:** ✅ 0 errors (worktree + main)
> **Smoke status:** All 4 routes (/tax-invoices, /tax-invoices/new, /tax-invoices/[id], /reports/vat30) compile + auth-redirect

---

## 🎯 ที่ทำใน Session 25B

### Tax Invoices module (full)

**Schema** (`src/server/services/google-sheets.service.ts`)
- Added `SHEET_TABS.TAX_INVOICES` + `SHEET_TABS.TAX_INVOICE_LINES` (header + lines split per design 4.7/4.8)
- 27 columns on header tab including `IssuedAt`, `VoidedAt`, `VoidReason`, `CustomerBranchSnapshot`, `CreditNoteID` (Phase 2 reserved)
- 10 columns on lines tab including `ExpenseNature` ("goods" | "service") for ภ.พ.30 split
- Added `getTaxInvoices()`, `getTaxInvoiceById()`, `getTaxInvoiceLines()` helpers
- Tabs auto-create via existing `ensureAllTabsExist()` — first request to /tax-invoices materialises them

**Router** (`src/server/routers/taxInvoice.router.ts` — new, 600 LOC, registered in `_app.ts`)
- `list`, `getById` — orgProcedure
- `create`, `update`, `issue`, `void`, `delete`, `convertFromBilling`, `convertFromQuotation` — `permissionProcedure("manageTaxInvoices")`
- **State machine:** `draft → issued → void` (all transitions audit-logged)
- **Sequential numbering compliance** (RD requirement):
  - DocNumber stays empty until `issue`
  - On `issue`: `computeNextDocNumber("TI", year, TAX_INVOICES, status === "issued")` — only counts issued docs (skip drafts/voids → no gaps in the issued sequence)
  - Voided numbers stay in the sequence (per RD: do not re-use)
- **Issue gates** — block if customer is missing TaxID or Branch snapshot (avoids non-compliant invoices)
- **Date validation** — `validateDocDate()`: future date hard-block, backdate >7 days returns warning string
- **Lock contract** — once issued, only `void` is allowed; update/delete throw `PRECONDITION_FAILED`
- **Convert flows preserve snapshots** — customer fields snapshot at time of TI create, regardless of source

**Pages**
- `/tax-invoices` — list with status/customer/date filters, plan-gated `pro+`, bulk-PDF only for issued
- `/tax-invoices/new` — form with goods/service per line, no WHT (TI ≠ Billing)
- `/tax-invoices/new?fromBilling=BIL-x` — server-side passes ID; client mounts → calls `convertFromBilling` → redirects
- `/tax-invoices/new?fromQuotation=QT-x` — same pattern with `convertFromQuotation`
- `/tax-invoices/[id]` — detail with state buttons (issue / void modal / delete draft / PDF) + locked-banner when issued/void
- `/tax-invoices/[id]/edit` — re-uses NewTaxInvoiceClient with mode="edit", refuses non-draft

**PDF** (`/documents/tax-invoice/[id]`)
- 2-page layout (ต้นฉบับ + สำเนา) like billing PDF
- RD-compliant header: company TaxID + branch label, customer TaxID + branch (separate field)
- Per-line ประเภท column (สินค้า / บริการ)
- VOID watermark + banner when status=void
- Draft banner when status=draft (warns user PDF is not yet a valid tax invoice)
- Color theme: red/maroon (`#b91c1c`) — distinguishes from billing's purple
- Auto-download via `?download=1` (same pattern as billing)

**UX integrations**
- Billing detail page (`status` ∈ sent / partial / paid) → button "→ ออกใบกำกับภาษี" → `/tax-invoices/new?fromBilling={id}`
- Quotation detail page (`status === accepted`) → "→ ออกใบกำกับภาษี (ตรง)" → `/tax-invoices/new?fromQuotation={id}` (skip billing flow)

### VAT Phase 2 (ภ.พ.30 combined)

**Procedures** (`src/server/routers/report.router.ts`)
- `report.vatSales` — Output VAT side. Reads TaxInvoices+Lines, filters status=issued + date range, returns per-doc rows + totals + goods/service split
- `report.vat30` — Combined input + output, with net calculation. Returns `{ input, output, net }` where `net.direction ∈ "pay" | "carry_forward" | "balanced"`

**Page** (`/reports/vat30`)
- 3-tab UI: สรุป (default) / ภาษีขาย / ภาษีซื้อ
- Summary tab: 3 cards — output VAT, input VAT, Net VAT (color-coded by direction)
- Output tab: per-tax-invoice table with totals row
- Input tab: per-paid-payment table with totals row
- Date range defaults to current month, "เดือนนี้" reset button

### Sidebar updates
- Added "รายงาน ภ.พ.30 (รวม)" → `/reports/vat30` (📈)
- Renamed existing "รายงาน ภพ.30" → "รายงานภาษีซื้อ (ภ.พ.30)" (🛒) — `/reports/vat` unchanged
- ใบกำกับภาษี link already present from S25A — now functional

---

## 📦 Commit

```
df1868b feat(S25B): Tax Invoices CRUD + RD-compliant PDF + VAT Phase 2 (vatSales + vat30 + 3-tab report) + convert flows from billing/quotation
```

⚠️ **Push blocked by harness** — pi please push from Terminal:
```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense && git push origin main
```

---

## ✅ Smoke checklist (พี่ run after push)

- [ ] `/tax-invoices` opens — list page renders with empty state
- [ ] `/tax-invoices/new` — form renders, customer dropdown loads
- [ ] Save draft → redirected to `/tax-invoices/[id]` with status=draft + (ยังไม่ออกเลข)
- [ ] Edit draft works
- [ ] **Issue without TaxID → blocks** with PDPC-aligned error
- [ ] **Issue with TaxID + Branch → succeeds**, DocNumber assigned (TI-2026-0001 format), status=issued
- [ ] After issue: edit → blocked with lock banner
- [ ] PDF opens at `/documents/tax-invoice/[id]` — 2 pages (ต้นฉบับ + สำเนา) with TaxID + Branch shown
- [ ] Void modal — requires reason + sets status=void + watermark on PDF
- [ ] **Convert flow:** /billings/[paid] → "→ ออกใบกำกับภาษี" → creates draft TI, snapshots from billing
- [ ] **Convert flow:** /quotations/[accepted] → "→ ออกใบกำกับภาษี (ตรง)" → skips billing
- [ ] Sequential numbering: issue 2 TIs in same year → numbers 0001, 0002 — no gap
- [ ] Void TI then issue another → number is 0003 (NOT re-using 0002 — RD compliant)
- [ ] `/reports/vat30` — 3 tabs work, summary shows output/input/net correctly
- [ ] No-regression: `/expenses`, `/payments`, `/quotations`, `/billings` still work

---

## ⚠️ Known issues / Watch out

1. **🟡 Sequential numbering — single-instance race risk** — at high concurrency two instances could compute the same next-DocNumber simultaneously. Acceptable for SME scale (1-3 issuers per org). For enterprise, add a Postgres-backed sequence or Redis INCR. Documented; not blocker.
2. **🟡 Convert flow uses URL query param** — refresh during convert mounts the mutation again, but `convertedRef.current` guards. If pi reloads while convert is in-flight a second draft might be created. Re-check after convert; pi can delete the orphan draft.
3. **🟡 Customer Branch — only branchType="Branch" with branchNumber is non-empty** — customers stored with branchType="HQ" auto-get "00000". If old customer rows lack BranchType, issue will block until customer is updated. Document for soft launch.
4. **🟡 PDF watermark for VOID** — uses CSS rotate-30deg + 18% opacity red text. Looks good in screenshot but check actual download — html2canvas may render differently.
5. **🟡 TI doesn't link back to Billing's PaidAmount** — billing remains untouched after TI issue. If user wants "billing.status updates when TI issued", add a future hook. Currently independent (matches design 3.4 "Q→B→TI / Q→TI / B→TI / TI standalone — all combinations allowed").
6. **🟡 Credit notes (Phase 2)** — schema reserves `CreditNoteID` field, but no router/page yet. Future work when user reports a need.
7. **🟡 No `ExpenseNature` split on issue UX** — defaults to "service"; user must edit each line if mixed. Not a compliance blocker (RD just wants the totals split, which `report.vatSales` calculates).

---

## 🔋 Environment State (จบ S25B)

```
Repo:            ~/Code/Aim Expense V2/aim-expense
Worktree:        .claude/worktrees/compassionate-liskov-2bc32d
Branch:          main
HEAD:            df1868b
Vercel:          Hobby ⚠️ (need upgrade Pro before launch)
Type check:      ✅ 0 errors (worktree + main)
Smoke (auth-gate): ✅ all 4 new routes
Redis cache:     ✅ S25A live (Upstash SG)
PDPA docs:       ✅ S25A — pending lawyer review
Sentry:          🟡 wired, needs DSN (pi to set up)
DB:              Supabase Singapore — no schema changes in S25B
```

### Phase status

| Phase | สถานะ |
|-------|-------|
| Cache layer (Redis/Upstash) | ✅ S25A |
| ADR documenting cache override | ✅ S25A |
| PDPA legal docs | ✅ S25A (drafts pending lawyer) |
| DSR flow `/account/data` | ✅ S25A |
| Login consent checkbox | ✅ S25A |
| Sidebar legal links | ✅ S25A |
| Vercel Analytics + Speed Insights | ✅ S25A |
| Sentry (DSN-gated) | 🟡 S25A — needs DSN |
| autocannon load test | ✅ S25A |
| **Tax Invoices CRUD** | ✅ **S25B** |
| **TI sequential numbering + lock** | ✅ **S25B** |
| **Convert from Billing/Quotation** | ✅ **S25B** |
| **RD-compliant TI PDF** | ✅ **S25B** |
| **VAT Phase 2 (vatSales + vat30)** | ✅ **S25B** |
| **/reports/vat30 (3 tabs)** | ✅ **S25B** |
| Sidebar TI link active + VAT-30 entry | ✅ S25B |
| WHT Phase 2 polish | 🟡 carry-forward |

---

## 🚀 Roadmap update

Sprint B (Revenue flow) **CLOSED**:
- S23 Customers + Quotations ✅
- S24 Billings + recordPayment ✅
- S25A Redis + PDPA + Monitoring ✅
- S25B Tax Invoices + VAT P2 ✅

Next sprint candidates (Sprint C):
- S26 — Stripe billing module (subscription enforcement)
- S27 — Polish: WHT Phase 2 ใบสรุป, Tax Invoice credit notes, OCR-fill for TI
- S28 — Penetration test prep + status page
- S29 — Pre-launch QA + final docs review (lawyer sign-off)
- S30 — Soft launch

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

Subscription:
  plan: pro (manually for testing — needed to access /tax-invoices + /reports/vat30 plan-gates)
```

---

## 📝 Pre-S26 prep (พี่ทำเอง)

1. **Push S25B**:
   ```bash
   cd ~/Code/Aim\ Expense\ V2/aim-expense && git push origin main
   ```
2. **Run smoke checklist above** — confirm sequential numbering + RD compliance
3. **Update an existing customer to have TaxID + Branch** before issuing the first TI (if not already)
4. **Try `/reports/vat30`** with current month range — verify input + output VAT show up

---

*Handoff by Claude — Session 25B end — 2026-05-09*
