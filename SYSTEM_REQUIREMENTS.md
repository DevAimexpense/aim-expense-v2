# 🔐 Aim Expense — System Requirements (CORE)

> **สำคัญที่สุด** — เอกสารนี้คือ Single Source of Truth ของ Aim Expense
> **ทุก session ต้องอ่านก่อนเริ่มงาน** — ก่อน HANDOFF.md และก่อนเขียน code ใดๆ
>
> Last updated: 2026-04-26 (Session 16)

---

## 🎯 Architecture Principles (เปลี่ยนไม่ได้ — Non-Negotiable)

### 1️⃣ Data Sovereignty — User เป็นเจ้าของข้อมูล 100%

**ข้อมูลทั้งหมดของ user เก็บที่ Google Drive และ Google Sheet ของ user เท่านั้น**

- Spreadsheet `Aim Expense Data` อยู่ใน **Google Drive ของ user**
  - tabs: `Events`, `Payees`, `Banks`, `CompanyBanks`, `Payments`, `EventAssignments`, `Config`
- ไฟล์ใบเสร็จ / ใบกำกับภาษี / ใบหัก ณ ที่จ่าย / PDF เอกสารต่างๆ → folder ใน **Google Drive ของ user**
- User สามารถเข้าถึง / ดาวน์โหลด / ลบข้อมูลตัวเองได้ตลอดเวลาผ่าน Google Drive โดยตรง

**Implication สำหรับการเขียน code:**
- ทุก data operation ต้องผ่าน `getSheetsService(orgId)` → ใช้ Google Sheets API ของ user เอง
- ห้ามสร้าง Prisma model สำหรับ data ของ user (Payment, Event, Payee, Receipt, ฯลฯ)
- ห้าม cache ข้อมูลใน Redis / external storage ของระบบเรา

---

### 2️⃣ Zero Data Retention — ระบบเราไม่เก็บข้อมูล user

**เพื่อความปลอดภัยและ privacy สูงสุด ระบบ Aim Expense ไม่เก็บข้อมูลธุรกิจของ user เลย**

ระบบเรา (Postgres / Prisma) เก็บได้แค่ **infrastructure metadata** เท่านั้น:

| ✅ เก็บได้ | ❌ ห้ามเก็บ |
|-----------|--------------|
| `User` — credentials, sessions | Payment / Event / Payee data |
| `Organization` — org info | ใบเสร็จ / ใบกำกับภาษี / receipts |
| `OrgMember` + `UserPermission` — สิทธิ์ในองค์กร | งบประมาณ / ยอดค่าใช้จ่าย |
| `Subscription` — plan + billing | report aggregations / cache |
| `LineConnection` / `GoogleConnection` — OAuth tokens | OCR results, AI analysis |
| `Invitation` — invite tokens | สำเนาบัตรประชาชน |
| `AuditLog` — action logs (ไม่มีข้อมูลธุรกิจ มีแค่ ref ID + summary) | ข้อมูลส่วนบุคคลของ vendor |
| `LineDraft` — draft state ชั่วคราว (ลบหลัง confirm) | ฯลฯ |

**Implication สำหรับการเขียน code:**
- ห้ามสร้าง Prisma table ใหม่ที่เก็บ payment / receipt / amount / vendor data
- AuditLog เก็บได้แค่ `entityRef` (ID) + `summary` (สั้น) — ไม่เก็บ raw data
- Logging / monitoring (Vercel logs) ต้องไม่มี PII / amount / receipt content
- ถ้า user ลบ org → ลบ Prisma metadata ของ org นั้น แต่ Google Sheet ของ user ยังอยู่ใน Drive ของเขา

---

### 3️⃣ Reports = Read-only Aggregation จาก Google Sheet

**Reports ทุกประเภทต้อง query จาก Google Sheet ของ user นั้นๆ เท่านั้น**

- `report.expenseSummary`, `report.byProject`, `report.byVendor`, `report.vat`, `report.profitLoss`, ฯลฯ ต้องเรียก `sheets.getPayments()` / `sheets.getEvents()` / `sheets.getPayees()` แล้ว aggregate in-memory
- ห้ามเก็บ snapshot / cache ของ aggregation ในระบบเรา
- ถ้าต้อง optimize performance → optimize ภายใน request เดียว (เช่น parallel `Promise.all` ของ Sheets API calls) ไม่ใช่เก็บผลลัพธ์
- export (CSV / XLSX / PDF) → generate ทุกครั้งจาก fresh data, ไม่เก็บไฟล์บน server

**Implication สำหรับการเขียน code:**
- Report router pattern: `orgProcedure → getSheetsService(ctx.org.orgId) → getXxx() → filter/aggregate → return`
- ไม่ต้องมี report cache table
- ไม่ต้องมี cron job สรุปข้อมูลล่วงหน้า
- ถ้า Sheets API ช้า → optimize parallel calls หรือ use specific tab range, ไม่ใช่เก็บ cache

---

### 4️⃣ Plan-Gated Features — ทุก menu / feature ต้องรองรับ permission gate

**ทุก menu และ feature ต้องเปิด/ปิดได้แยกตาม subscription ของ user แต่ละคน**

ระบบ permission มี 2 layer:

#### Layer A: Role-based (ภายใน org)
- 4 roles: `admin` / `manager` / `accountant` / `staff`
- กำหนดผ่าน `OrgMember.role` + `UserPermission` (per-key override)
- Permission keys อยู่ใน `src/types/permissions.ts` (เช่น `manageEvents`, `updatePayments`, `approvePayments`, `viewReports`, `editPaymentAfterApproval`, `managePayees`, ฯลฯ)
- บังคับใช้ผ่าน `permissionProcedure("permissionKey")` ใน tRPC

#### Layer B: Plan-based (subscription)
- Plans: `free` / `basic` / `pro` / `business` / `max` / `enterprise`
- Plan determines feature access (เช่น `pro+` ปลดล็อก VAT report, P&L, Revenue tracking)
- กำหนดผ่าน `Subscription.plan` ใน Prisma
- บังคับใช้ทั้งใน UI (hide menu) และ Server (block tRPC procedure)

**Implication สำหรับการเขียน feature ใหม่ — ทุก feature ต้องตอบ 4 คำถามนี้:**
1. **Permission key** ที่ต้องใช้คือ? (ถ้าไม่มี → เพิ่มใน `src/types/permissions.ts`)
2. **Minimum plan** ที่เข้าถึงได้คือ? (`free` / `basic` / `pro+` / `business+`)
3. **Sidebar gating** — เพิ่ม `permission: "..."` ใน NAV_GROUPS + ใช้ `PLAN_FEATURES` map ใน UI ที่เกี่ยวข้อง
4. **Server enforcement** — ใช้ `permissionProcedure("...")` ไม่ใช่แค่ `orgProcedure` + check plan ใน procedure ถ้าเป็น plan-gated

**ตัวอย่างใน codebase:**
- Sidebar: `src/components/layout/sidebar.tsx` → `NavItem.permission` + `NavItem.adminOnly`
- Dashboard: `dashboard-client.tsx` → `PLAN_FEATURES` map (`{ revenue, vat, pl }`)
- tRPC: `payment.router.ts` → `permissionProcedure("updatePayments")` / `permissionProcedure("approvePayments")`

---

## 📋 Quick Reference — Pattern สำหรับทุก feature ใหม่

### สร้าง tRPC procedure ใหม่ (Read)

```typescript
import { router, orgProcedure } from "../trpc";
import { getSheetsService } from "../lib/sheets-context";

export const xxxRouter = router({
  list: orgProcedure
    .input(z.object({ /* filters */ }))
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const data = await sheets.getXxx();          // ← จาก user's sheet
      return data.filter(/* in-memory */).map(/* shape */);
    }),
});
```

### สร้าง tRPC procedure ใหม่ (Write)

```typescript
create: permissionProcedure("xxxPermission")     // ← ต้องระบุ permission
  .input(InputSchema)
  .mutation(async ({ ctx, input }) => {
    const sheets = await getSheetsService(ctx.org.orgId);
    await sheets.appendRowByHeaders(SHEET_TABS.XXX, { ... });

    await prisma.auditLog.create({                // ← เก็บแค่ ref + summary
      data: {
        orgId: ctx.org.orgId,
        userId: ctx.session.userId,
        action: "create",
        entityType: "xxx",
        entityRef: newId,
        summary: `สร้าง XXX ใหม่`,                // ← ห้ามใส่ data จริง
      },
    });
    return { success: true };
  }),
```

### สร้าง menu / page ใหม่

```typescript
// 1. Sidebar (src/components/layout/sidebar.tsx)
{
  label: "ฟีเจอร์ใหม่",
  href: "/new-feature",
  icon: "✨",
  permission: "viewXxx",          // ← ระบุ permission ที่ต้องใช้
}

// 2. Server entry (page.tsx) — auth + org check
export default async function NewFeaturePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const org = await getOrgContext(session.userId);
  if (!org) redirect("/");

  // ถ้า plan-gated:
  const subscription = await prisma.subscription.findUnique({ where: { orgId: org.orgId }});
  const allowedPlans = ["pro", "business", "max", "enterprise"];
  if (!allowedPlans.includes(subscription?.plan || "free")) {
    redirect("/dashboard?upgrade=required");
  }

  return <NewFeatureClient ... />;
}
```

---

## 🚫 Anti-Patterns — สิ่งที่ห้ามทำ

❌ **ห้ามเพิ่ม Prisma model สำหรับ business data**
- ❌ `model Payment { ... }`
- ❌ `model Receipt { ... }`
- ❌ `model ReportCache { ... }`

❌ **ห้าม cache data ของ user นอก Google Sheets**
- ❌ Redis / Upstash สำหรับ payment data
- ❌ Vercel KV สำหรับ aggregation
- ❌ Local file cache บน server

❌ **ห้าม log ข้อมูลธุรกิจของ user**
- ❌ `console.log("Payment:", payment)` (มี amount + vendor)
- ❌ Vercel logs ที่มี receipt content
- ✅ `console.log("Payment created:", paymentId)` (แค่ ID)

❌ **ห้าม skip permission check**
- ❌ ใช้ `orgProcedure` แทน `permissionProcedure(...)` ในทุก mutation
- ❌ Hide UI element อย่างเดียว ไม่บังคับ server
- ❌ Hard-code plan = "pro" ทุกที่

---

## 🔗 Related Files

| ไฟล์ | หน้าที่ |
|------|---------|
| `src/server/trpc.ts` | Procedure factory: `orgProcedure`, `permissionProcedure(...)` |
| `src/server/lib/sheets-context.ts` | `getSheetsService(orgId)` — Google Sheets client per org |
| `src/server/services/google-sheets.service.ts` | `SHEET_TABS`, getXxx methods, append/update/delete |
| `src/types/permissions.ts` | All permission keys + role default mapping |
| `src/components/layout/sidebar.tsx` | NAV_GROUPS — menu permission + adminOnly gating |
| `prisma/schema.prisma` | **Infrastructure only** — User, Org, Subscription, AuditLog, etc. |

---

## 📝 Changelog

- **2026-04-26** (Session 16) — Initial document, formalize 4 core principles after Reports feature design discussion
