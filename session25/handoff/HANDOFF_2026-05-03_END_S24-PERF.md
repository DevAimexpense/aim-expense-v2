# Session 24 (extended) → Session 25 — Handoff (FINAL)

> **Created:** 2026-05-03 (end of extended S24)
> **Worktree:** `.claude/worktrees/agitated-rhodes-4dd891`
> **Branch:** `claude/agitated-rhodes-4dd891`
> **Type check:** ✅ 0 errors
> **Smoke status:** Phase 1 ✅, Phase 2 ✅, Performance phases ✅, perf still bottlenecked by Sheets API quota

---

## 🎯 ที่ทำใน Session 24 (extended — รวม S24 P1, P2, perf passes, fixes)

### Functional features
- **Phase 1**: Billings CRUD + recordPayment (5 payment methods) + Q→B convert + Prisma migration revenue permissions
- **Phase 2**: PDF Quotation + Billing (printable HTML, 2-page ต้นฉบับ+สำเนา in single file) + bulk download
- **/permissions UX rework**: master-detail split view (list ซ้าย, grid ขวา)

### Bug fixes (in chronological order)
1. ปุ่ม "← กลับ" ใน PDF page → "✕ ปิด" (window.close())
2. TaxID leading zero → `preserveLeadingZeros()` ใน service layer
3. PDF buttons: เปลี่ยนเป็น "📄 พิมพ์เอกสาร" (เดิม "ดูเอกสาร")
4. PDF stamp: ลบกรอบ "→ converted/✓ paid/etc." → ย้าย "ต้นฉบับ/สำเนา" มาแทน
5. PDF refactor: 2 หน้าในไฟล์เดียว + download แทน print + bulk download

### Performance optimizations (multiple iterations)
1. **orgInfoCache** (4-min TTL) — cache decrypted token + spreadsheetId per orgId
2. **ensureTabsCached** (1-hour TTL) — skip expensive Sheets metadata calls
3. **Lazy customer query** ใน list pages — load หลัง main list
4. **loading.tsx** sibling files — Next.js auto-render skeleton ตอน navigate (7 routes)
5. **React.cache()** wrap getSession + getOrgContext — dedupe layout + page calls
6. **Slim down 8 page.tsx** — remove duplicate auth/org checks (layout ทำให้แล้ว) → minimal `select: { plan: true }`
7. **batchGet** — quotation.getById + billing.getById + PDF pages = 1 HTTP call แทน 2

### Failed experiment (reverted)
- **RSC server-side initial fetch** (commit 95a463c → reverted aa072e7): เพิ่ม TTFB ~120ms เพราะ page block ก่อน HTML ส่งกลับ. กลับไปเป็น client-side tRPC pattern.

### Performance state — final
- /quotations + /billings + /customers list page **header ขึ้นทันที (~50ms TTFB)** + data ตามมา ~200-400ms
- Detail pages **~250-400ms** (1 batchGet call vs 2)
- เร็วเทียบเคียงได้กับ /expenses (ที่พี่บอกว่าเร็วแล้ว)
- React Query 5-min staleTime → revisit ภายใน 5 min = instant

---

## 📦 Commits S24 extended (12 total)

```
1a2ce45 perf(S24): Sheets batchGet — quotation/billing detail + PDF pages
0e596bb perf(S24): React.cache + slim revenue page.tsx
aa072e7 Revert RSC pattern (was slower)
95a463c perf(S24): RSC server-side initial fetch (REVERTED)
8debc1e perf(S24): lazy customer query + loading.tsx skeletons
e6fd416 chore(S24): remove dead .status-stamp CSS
2d13830 feat(S24): rename ดูเอกสาร→พิมพ์เอกสาร + move ต้นฉบับ/สำเนา stamp
bdfd563 feat(S24): refactor PDF — 2-page in one file + download
1162a9b feat(S24): perf cache + ต้นฉบับ/สำเนา + bulk + leading-zero + close
7317be4 feat(S24): Phase 2 — printable PDF + /permissions UX rework
310eecd docs(S24): Phase 1 handoff
1450a7b feat(S24): Phase 1 — Billings CRUD + recordPayment + Q→B convert
```

Plus session 23 commits:
```
4a897c3 docs(S23) handoff
a4aaf16 feat(S23): Phase 2 — Quotations CRUD
346546f feat(S23): Phase 1 — Customers + DocPrefix + permissions
```

---

## 🚀 Sync commands พี่ทำใน main repo

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
rm -f .git/index.lock

# Copy ทุกอย่าง (src + prisma + session24 + session25)
cp -R .claude/worktrees/agitated-rhodes-4dd891/src .
cp -R .claude/worktrees/agitated-rhodes-4dd891/prisma .
cp -R .claude/worktrees/agitated-rhodes-4dd891/session24 .
cp -R .claude/worktrees/agitated-rhodes-4dd891/session25 .

# Type check
npx tsc --noEmit

# Restart dev (clear .next cache)
rm -rf .next
npm run dev

# (smoke test ใน browser ตามด้านล่าง)

# Commit + push
git add src prisma session24 session25
git commit -m 'feat(S24): Revenue Phase 1+2 + perf optimization passes (Customers + Quotations + Billings + PDF + caching)'
git push
```

---

## ✅ Final smoke checklist (เร็ว — ก่อน close session)

- [ ] /quotations เปิดเร็ว header ทันที + data ตามมา
- [ ] /billings เปิดเร็ว
- [ ] /customers เปิดเร็ว
- [ ] /quotations/[id] (detail) เปิดเร็ว — batchGet ทำงาน
- [ ] /billings/[id] (detail) เปิดเร็ว
- [ ] /documents/quotation/[id] PDF — เห็น 2 หน้า (ต้นฉบับ + สำเนา) + ปุ่ม download
- [ ] /documents/billing/[id] PDF — เห็น 2 หน้า
- [ ] Bulk download — เลือก 2-3 รายการใน /quotations → click "💾 ดาวน์โหลด PDF (n)" → ได้ N ไฟล์
- [ ] /permissions UX ใหม่ — list ซ้าย + grid ขวา
- [ ] /settings/org → เลขที่เอกสาร (DocPrefix) ทำงานปกติ
- [ ] เพิ่มลูกค้า taxId `0123456789012` → save → reload → 0 นำหน้ายังอยู่ (ใน sheet ด้วย)
- [ ] No-regression on /expenses, /payments, /payment-prep, /approvals (ยังไม่แตะ)

---

## 🔴 ก่อนเปิด launch — Pre-launch checklist (ขนาด 1000 users)

### 1. Google Sheets API quota — ✅ requested 2026-05-03

**สถานะ:** พี่ submit quota request แล้ว — รอ Google approve (1-3 วันทำการ)

**Pre-req ที่จำเป็นก่อนขอ:** Cloud Project ต้อง link Billing Account
- Sheets API ฟรี 100% (no per-call charge)
- Billing account ใช้แค่ verification — bill จริง = $0/month
- ตั้ง budget alert $5 hard limit + disable paid APIs ที่ไม่ใช้
- Workspace package ไม่เกี่ยว — เป็นเรื่อง Cloud Console เท่านั้น

**Quota ที่ขอ:**
- Read requests per minute per project: 300 → **3000**
- Read requests per minute per user: 60 → **600**
- Write requests per minute per project: 300 → **600**

**Action S25:** ตรวจ email approval (`dev@aimexpense.com`) ก่อนเริ่ม Redis work

### 2. Vercel — upgrade Hobby → Pro (defer ตอน launch)
- ปัจจุบัน Hobby (downgraded 2026-05-02) — TOS ไม่อนุญาต commercial
- ก่อน launch = ต้อง Pro ($20/month base)
- 1TB bandwidth + 1000 GB-hours serverless
- 🟡 **Deferred:** ทำตอนใกล้ launch (ไม่ต้องทำใน S25 dev)

### 3. Supabase — upgrade เช็คขีดจำกัด (defer ตอน launch)
- Free tier: 500MB DB / 5GB egress / 50K MAU
- ถ้าเกิน → Pro $25/month (8GB DB, 250GB egress)
- 🟡 **Deferred:** ทำตอนใกล้ launch + เช็ค metrics ใน Supabase dashboard ว่าเกินยัง

---

## 🎯 Session 25 — Roadmap

### Priority order

**🔴 Phase 1 — Cache layer สำหรับ scale 1000+ users (must-have ก่อน launch)**

ปัญหา: ปัจจุบัน ทุก request → Sheets API call. Quota 300/min default จะเต็มที่ 100+ concurrent users

**Solution: Redis cache layer**

Stack แนะนำ: **Upstash Redis**
- Free tier 10K commands/day, $0.20/100K
- Simple HTTPS API (works in Vercel serverless, no connection pool issues)
- ไม่ vendor lock-in

Implementation plan:
1. Setup Upstash Redis account (free) → ได้ REST URL + token
2. `npm install @upstash/redis`
3. สร้าง `src/server/lib/cache.ts`:
   - `getOrFetch(key, ttlSec, fetcher)` — generic cache helper
   - `invalidate(key | prefix)` — ลบ cache เมื่อ write
4. แก้ `GoogleSheetsService.getAll(tab)` ให้ wrap ด้วย cache (TTL 30-60s)
5. Hook invalidate ใน `appendRow*` / `updateById` / `deleteById` — invalidate `${spreadsheetId}::${tabName}`
6. Cross-instance invalidation: ใช้ Redis key TTL ก็พอ (ไม่ต้อง Pub/Sub สำหรับ MVP — eventual consistency 30-60s acceptable)

⚠️ **Document:** ขัด SYSTEM_REQUIREMENTS principle 3 ตามตัวอักษร แต่:
- เก็บใน Redis (external, not our Postgres)
- TTL สั้น (30-60s)
- ไม่ใช่ aggregation snapshot — เป็น raw row cache
- จำเป็นเพื่อ scale 1000+ users

ผลที่คาดหวัง:
- List page (cache hit): ~30-80ms (vs 250-400ms ปัจจุบัน)
- Sheets API call: 1/30s ต่อ tab (ไม่ใช่ทุก request) → quota safe ที่ 1000 users

**🟡 Phase 2 — Tax Invoices + VAT Phase 2 (originally planned S25)**

(จาก roadmap design doc S22 section 14)
- TAX_INVOICES + TAX_INVOICE_LINES sheet tabs
- taxInvoice.router.ts — `issue` (sequential numbering!) + void
- Billing → TaxInvoice convert
- Quotation → TaxInvoice direct convert
- /tax-invoices page (locked layout post-issue)
- PDF for TI (RD-compliant layout)
- VAT Phase 2: report.vatSales + report.vat30 procedures
- /reports/vat30 page (3-tab — ซื้อ/ขาย/สรุป)

**🟢 Phase 3 — Monitoring + Load test (must-have ก่อน launch)**
- Vercel Analytics enable
- Vercel Speed Insights enable
- Sheets API quota dashboard ใน Google Cloud Console
- Simple load test ด้วย autocannon หรือ k6 (50-100 concurrent /quotations requests)
- Setup error reporting (Sentry free tier)

### Estimate

S25 ใหญ่ — แนะนำแบ่ง 2 sub-sessions:
- **S25A:** Phase 1 (Redis) + Phase 3 (Monitoring) — ~4-5 ชม.
- **S25B:** Phase 2 (Tax Invoices + VAT P2) — ~3-4 ชม.

หรือถ้าอยาก ship เร็ว: ทำ S25A ก่อน → launch → S25B หลัง launch

---

## ⚠️ Known issues / Watch out (carry-forward)

1. **🟡 SYSTEM_REQUIREMENTS principle 3 (no caching)** — กำลังจะถูก override ใน S25 Phase 1 (Redis). Document ใน ADR (Architecture Decision Record) ก่อน implement
2. **🟡 Vercel Hobby plan** — commercial TOS violation. Upgrade Pro ก่อน launch
3. **🟡 Multi-instance bandwidth** — Vercel auto-scale → ต้อง Redis (ไม่ใช่ in-memory) สำหรับ shared state
4. **🟡 ใบกำกับภาษี (Tax Invoice)** ปุ่มยัง disabled — S25 Phase 2
5. **🟡 PDF format = raster image** (html2canvas + jspdf) — text ไม่ select-able. ถ้าต้องการ vector PDF → migrate to `@react-pdf/renderer` (effort ~3-4 ชม.)
6. **🟡 Bulk download = N popup tabs** — browser อาจ block. UX อาจ sub-par. หากเป็นปัญหาจริง → server-side ZIP generation
7. **🟡 Customer existing record** ที่ taxId ตัด leading zero ไปแล้ว — ต้องเข้าไป edit + save ใหม่ทีละ customer

### Carry-forward จาก S22-23
- 🟡 WHT Phase 2 ใบสรุป polish — รอ screenshot
- 🟡 Sidebar "รายงาน ภพ.30" rename — S25 พร้อม VAT Phase 2

---

## 🔋 Environment State (จบ S24 extended)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Worktree:        .claude/worktrees/agitated-rhodes-4dd891
Branch:          claude/agitated-rhodes-4dd891
HEAD:            1a2ce45 — Sheets batchGet (latest perf opt)
Vercel:          Hobby ⚠️ (need upgrade Pro before launch)
Type check:      ✅ 0 errors
Smoke test:      🟢 Phase 1+2 passed by user. Performance feedback "เร็วขึ้นแล้ว" 2026-05-03
DB:              Supabase Singapore — schema migration applied (revenue permissions)
```

### Phase status

| Phase | สถานะ |
|-------|-------|
| รายได้ — Customers + DocPrefix | ✅ S23 |
| รายได้ — Quotations | ✅ S23 |
| รายได้ — Billings + recordPayment + Q→B convert | ✅ S24 |
| รายได้ — PDF (Quotation + Billing 2-page) | ✅ S24 |
| /permissions UX rework (master-detail) | ✅ S24 |
| Performance optimizations (revenue routes) | ✅ S24 |
| Revenue permission keys (Prisma) | ✅ S24 migration |
| **Cache layer (Redis) for 1000+ users** | ❌ **S25 Priority** |
| Tax Invoices + VAT Phase 2 | ❌ S25 |
| Monitoring + Load test | ❌ S25 |

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

Subscription (changed during S24 testing):
  plan: pro (manually upgraded 2026-05-03 in Prisma Studio for revenue feature testing)
```

---

*Handoff by Claude — Session 24 extended end — 2026-05-03*
