# Session 21 → Session 22 — Handoff (FINAL)

> **Created:** 2026-05-02 (end of Session 21)
> **Reason:** S21 multi-feature session — VAT report + Google settings + Permissions editor + critical OAuth callback bug fix
> **Repo:** `~/Code/Aim Expense V2/aim-expense`
> **Type check:** ✅ 0 errors
> **Smoke test:** 🟢 /reports/vat + /settings/google passed by user. /permissions ยังไม่ได้ test

---

## 🔴 อ่านก่อนเริ่มทำงานทุกครั้ง

1. **`SYSTEM_REQUIREMENTS.md`** ← Single Source of Truth (4 principles)
2. **ไฟล์นี้** ← S21 summary + S22 next
3. **`session20/handoff/HANDOFF_2026-04-26_END_WHT-PHASE2.md`** ← S20 context (WHT polish ที่ค้าง)

---

## 🎯 ที่ทำใน Session 21

### ✅ 1. VAT Report Phase 1 — รายงานภาษีซื้อ (`/reports/vat`)

**Scope decision:** Aim Expense เป็น expense system → /reports/vat แสดงเฉพาะ "รายงานภาษีซื้อ" (Input VAT). ฝั่งภาษีขายจะมาคู่กับ quotation/invoice module → ภพ.30 ทั้งใบ defer

**ไฟล์ใหม่:**
- `src/app/(app)/reports/vat/page.tsx` — server entry
- `src/app/(app)/reports/vat/vat-client.tsx` — client (filters + stats + DataTable + Export)

**ไฟล์แก้:**
- `src/server/routers/report.router.ts` — เพิ่ม `VatInput` schema + `report.vat` orgProcedure

**Filter rules:**
- `status === "paid"` + `DocumentType === "tax_invoice"` + `VATAmount > 0`
- Date filter: ReceiptDate (default — ตามสรรพากร) หรือ PaymentDate (toggle ใน UI)
- Optional project filter

**UI:** 4 stat cards (count / totalBase / totalVAT / vendorCount) + DateField dropdown + Export CSV/XLSX/PDF (generic landscape, no form-specific PDF)

### ✅ 2. Settings → Google (`/settings/google`)

**ไฟล์ใหม่:**
- `src/app/(app)/settings/google/page.tsx` — server-rendered, ~430 บรรทัด

**ไฟล์แก้:**
- `src/app/api/auth/google/callback/route.ts` — 🚨 **fix critical bug**

**🚨 Bug fix critical ใน OAuth callback:**

เดิม callback ตั้ง `onboardingStep = "company"` **เสมอ** → user ที่ "done" แล้ว reconnect จะถูก reset กลับไป onboarding! แก้แล้ว:
```ts
const isInOnboarding = session.onboardingStep === "line_login"
                    || session.onboardingStep === "line_oa"
                    || session.onboardingStep === "google";
data: { ...(isInOnboarding ? { onboardingStep: "company" } : {}) }
// redirect: in-onboarding → /onboarding/company, else → /settings/google?reconnected=1
```

**UI 3 sections + footer:**
- Google Account: email, connected date, token expiry (relative time + tone), scopes chips, ปุ่ม "🔄 เชื่อมต่อใหม่" (= `<a href="/api/auth/google">`)
- Master Spreadsheet: ลิงค์เปิด Sheet
- Drive Folders: 4 โฟลเดอร์ (root / receipts / documents / reports) + ลิงค์ revoke ที่ Google
- adminOnly (sidebar config + page-level role check)
- Server-rendered ทั้ง page — ไม่มี client/tRPC

### ✅ 3. Permissions (`/permissions`)

**Design decision:** /users page (existing) handles **role + eventScope + invite/remove** (high-level). /permissions handles **per-key override** (granular). They share OrgMember + UserPermission tables.

**ไฟล์ใหม่:**
- `src/app/(app)/permissions/page.tsx` — server entry (managePermissions gate)
- `src/app/(app)/permissions/permissions-client.tsx` — client (permission grid)

**ไฟล์แก้:**
- `src/server/routers/user.router.ts` — เพิ่ม 3 procedures:
  - `user.listPermissions` — return members + flat 14-key effective permissions (merge UserPermission row + role default fallback) + `isCustom` flag + `isOwner` / `isSelf` lock signals
  - `user.updatePermission` — toggle one key, set `isCustom=true`. Guards: ห้าม edit self หรือ org owner
  - `user.resetPermissions` — reset เป็น default ของ role + `isCustom=false`. Guards: ห้าม reset self
- AuditLog entries สำหรับทุก mutation (action: `update_permission` / `reset_permissions`)

**UI:**
- Per-member card with avatar + role badge + override badge (⚙️ ถ้า isCustom) + owner badge (👑) + self badge
- 5 permission groups (events / masterData / payments / reports / admin) — แต่ละ group แสดง toggle cells (auto-fill grid 220px+)
- Toggle cell: green tint เมื่อ ON, gray เมื่อ OFF, locked สำหรับ self/owner
- Filter: "ทั้งหมด" / "ปรับ override แล้ว"
- ปุ่ม "↺ รีเซ็ตเป็น default" ต่อ user (เฉพาะ isCustom=true + ไม่ใช่ self/owner)
- Optimistic via `utils.invalidate()` — refetch หลัง mutate

---

## 📦 Files changed (un-committed)

```
NEW  src/app/(app)/reports/vat/page.tsx
NEW  src/app/(app)/reports/vat/vat-client.tsx
MOD  src/server/routers/report.router.ts
NEW  src/app/(app)/settings/google/page.tsx
MOD  src/app/api/auth/google/callback/route.ts
NEW  src/app/(app)/permissions/page.tsx
NEW  src/app/(app)/permissions/permissions-client.tsx
MOD  src/server/routers/user.router.ts
NEW  .claude/launch.json (optional)
NEW  session21/handoff/HANDOFF_2026-05-02_END_VAT-PURCHASE.md
```

---

## 🚀 Commands พี่ทำก่อนปิด S21

```bash
cd ~/Code/Aim\ Expense\ V2/aim-expense
rm -f .git/index.lock

# Type check
npx tsc --noEmit

# Smoke test /permissions
npm run dev
# เปิด http://localhost:3000/permissions
# ลองเปิด-ปิด permission คนอื่น (admin คนละคน หรือ staff)
# ลองรีเซ็ตเป็น default
# ตรวจ self / owner ล็อกได้

# Commit
git add -A
git commit -m 'feat(S21): VAT รายงานภาษีซื้อ + /settings/google + /permissions per-key editor + fix callback onboardingStep guard'
git push
```

---

## ⚠️ Known Issues / Watch Out

1. **🟡 Prisma 5.22 → 7.8 update prompt** — อย่า upgrade (major jump ข้าม v6, breaking changes). Tech debt S25+

2. **🟡 Sidebar label "รายงาน ภพ.30"** — ตอนนี้แสดงแค่ Input VAT. ควร rename เป็น "รายงานภาษีซื้อ (ภ.พ.30)" หรือ "ภพ.30 — ภาษีซื้อ" (พร้อม Phase 2 ฝั่งขาย)

3. **🟡 OAuth callback flow** — smart guard ทำงานถูก: in-onboarding → /onboarding/company, post-onboarding → /settings/google?reconnected=1. ถ้าจะเพิ่ม flow อื่น (re-auth จาก dashboard) ต้อง pass state param

4. **🟡 /permissions optimistic update** — ตอนนี้ใช้ `invalidate()` (refetch) ไม่ใช่ true optimistic. ถ้าโหลดช้า → toggle จะ "snap back" ก่อน update. Acceptable สำหรับ MVP

5. **🟡 Single-line commit messages** — ห้ามใช้ multi-line `"`

6. **🟡 Cowork sandbox** — ต้อง copy worktree → main repo (ไม่งั้น dev server เห็นไม่เจอ). ทุก feature S21 copy เรียบร้อยแล้ว

7. **🟡 git index.lock อาจค้าง** — `rm -f .git/index.lock`

---

## 🔋 Environment State (จบ S21)

```
Repo path:       ~/Code/Aim Expense V2/aim-expense
Branch:          main (S20 commit b9a3c80 already pushed)
HEAD (local):    S21 changes uncommitted — รอพี่ smoke test /permissions + commit
Vercel:          Hobby (downgraded 2026-05-02)
Type check:      ✅ 0 errors
Smoke test:      🟢 /reports/vat + /settings/google passed. /permissions ยังไม่ test
DB connection:   ✅ Healthy (Supabase Singapore)
```

### Phase status

| Phase | สถานะ | หมายเหตุ |
|-------|-------|----------|
| Phase 4 Reports WHT — Phase 1 | ✅ 100% | S19 |
| Phase 4 Reports WHT — Phase 2 (PDF 4 forms) | 🟡 95% | S20 — ใบสรุป polish ค้าง |
| **Phase 4 Reports VAT — Phase 1 (ภาษีซื้อ)** | ✅ 100% | **S21** |
| Phase 4 Reports VAT — Phase 2 (ภาษีขาย + ภพ.30 ทั้งใบ) | ❌ 0% | รอ quotation/invoice module |
| **Settings → Google** | ✅ 100% | **S21** |
| **Settings → Permissions** | ✅ 100% | **S21 — per-key override editor** |
| Settings → Billing | ❌ 0% | Phase 6 — รอ Stripe integration |
| รายได้ (Quotations/Billings/Tax-Invoices) | ❌ 0% | Big feature — XL effort |
| Phase 4 Inactive Payees + Audit Logs UI | ❌ 0% | S22+ |
| Phase 4 Dashboard role-specific | ❌ 0% | S24+ |

---

## 🎯 Sidebar dead-link audit (จบ S21)

### บริหารจัดการ — เหลือ 1 dead link เท่านั้น (จาก 3)
- ✅ จัดการผู้ใช้ (`/users`) — done (S18-)
- ✅ ตั้งค่าองค์กร (`/settings/org`) — done
- ✅ เปลี่ยนบริษัท (`/select-org`) — done
- ✅ **เชื่อมต่อ Google (`/settings/google`)** — **DONE S21** ✨
- ✅ **จัดการสิทธิ์ (`/permissions`)** — **DONE S21** ✨
- ❌ **แพ็คเกจ (`/settings/billing`)** — Phase 6 (~S26-28) — รอ Stripe

### รายได้ — ยังไม่เริ่มทั้งหมด (XL effort)
- ❌ ใบเสนอราคา (`/quotations`)
- ❌ ใบวางบิล (`/billings`)
- ❌ ใบกำกับภาษี (`/tax-invoices`)

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

## 🎯 งาน Session 22 — Priority

### 🚀 ลำดับงาน:

1. **Smoke test /permissions** ที่เหลือจาก S21 → fix bug ถ้ามี
2. **WHT Phase 2 polish** — รับ screenshot จากพี่ → fix CSS ใบสรุป (ค้างจาก S20)
3. **Smoke test ใบแนบ ภงด.53 + ใบสรุปทั้ง 2** — ค้างจาก S20
4. **เริ่ม "รายได้" foundation** — design Sheets schema (Quotations/Billings/TaxInvoices) + state machine (S23-25 implement)
5. **(Optional) Inactive Payees + Audit Logs UI** — admin tools

---

*Handoff by เอม — Session 21 end — 2026-05-02*
