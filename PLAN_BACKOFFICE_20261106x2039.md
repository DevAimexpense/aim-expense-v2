# PLAN_BACKOFFICE — แผนหน้าบริหารลูกค้า Aim Expense (ยังไม่เขียนโค้ด รอพี่พิมตอบ 5 ข้อ)

> ตาม `../aim-hr/PROMPT_AIM_EXPENSE_BACKOFFICE_20261106x1840.md` + `HANDOFF_BACKOFFICE_20261106x1840.md`
> อ่านแล้ว: SYSTEM_REQUIREMENTS.md · HANDOFF_20261106x1808.md (ล่าสุด) · backoffice.router.ts · admin/customers · trpc.ts · middleware.ts · comp.ts · sidebar · schema (Subscription/UsageCounter/GoogleConnection/OrgMember/Invitation/AuditLog) · ต้นแบบ aim-hr: customers.router (overview/accounts/orgDetail/assignPlan), demo-admin.ts, (back-office) route group

## สถานะ repo ที่ตรวจแล้ว
- HEAD `d9c3916` = prod `77718f4` + 3 commit เอกสาร/สคริปต์เดโม (ยังไม่ push, ไม่กระทบระบบ) · working tree สะอาด · `prisma db push` ของรอบ 4 ทำแล้ว (06/11 18:1x)
- **ฐานข้อมูลแยกกัน**: aim-expense = Supabase `aws-1-…` · aim-hr = `aws-0-…` → ข้อมูล pipeline/ลีด แชร์ข้าม DB ตรง ๆ ไม่ได้
- ตอนนี้ Stripe รับเฉพาะบัตร (`payment_method_types: ["card"]`) · ใน `Subscription` ไม่มีสถานะ "วางบิล/โอน" (status มาจาก Stripe หรือ "active" ของ comp) → ถ้าจะทำข้อ 5 ต้องนิยามค่าใหม่ (เช่น `status = "manual"`) โดยไม่แตะ schema ได้ แต่ต้องกัน webhook/cron ไม่ทับ
- ประตูปัจจุบัน: `backofficeProcedure` = `ctx.org.isBackoffice && role === "admin"` ของ **บริษัทที่เลือกอยู่** → สลับบริษัทแล้วเมนูหาย (จุดเสี่ยงข้อ 2 ของ handoff ยืนยันจริง)

## แผนรายหน้า (เฟส 1 — ไม่แตะ schema)

### หน้า A — ประตูเข้า (ทำก่อนทุกหน้า)
- helper ใหม่ `src/lib/auth/backoffice.ts` → `isBackofficeAdmin(userId)`: มี `OrgMember` active role admin ใน org ใดก็ได้ที่ `settings.backoffice = true` (query เดียว, cache ด้วย `React.cache` ต่อ request) — เลียนแบบ `isDemoAdmin` ของ HR แต่ไม่ใช้ env id เพราะ repo นี้มี flag ใน settings อยู่แล้ว (`scripts/setup-backoffice.ts`)
- `backofficeProcedure` ใน trpc.ts → ใช้ helper นี้แทนเช็ก `ctx.org` (ยังต้อง login; ไม่ต้องเลือกบริษัทหลังบ้าน)
- sidebar: `backofficeOnly` ใช้ค่าจาก `org.me`/layout ที่คำนวณ `isBackofficeAdmin` แทน `ctx.org.isBackoffice` → เมนูไม่หายเมื่อสลับบริษัท
- เทส: `scripts/uat_<ts>/backoffice-gate.test.ts` (tsx) — เรียก `appRouter.createCaller` ด้วย session ของ (ก) admin หลังบ้านที่เลือกบริษัทอื่น → ผ่าน (ข) admin ของบริษัทลูกค้า → FORBIDDEN (ค) staff ของบริษัทหลังบ้าน → FORBIDDEN · รันกับ DB ทดสอบ/ org ทดสอบเท่านั้น

### หน้า B — ภาพรวม `/<route>` (ต้นแบบ `overview` ของ HR)
- การ์ด 4 ใบ: **จ่ายจริง** (มี `stripeSubscriptionId` + status active/trialing/past_due + ไม่ lifetime + ไม่ใช่บริษัทหลังบ้าน) · **ทดลอง** (`isInTrial` และไม่ lifetime; แยก "ทดลองจากสมัคร" กับ "ทีมให้ฟรีเป็นเดือน" ไม่ได้ด้วยข้อมูลปัจจุบัน — จะแสดงรวมและใส่หมายเหตุ) · **ฟรีตลอดชีพ** (`isBetaTester`) · **ฟรี** (ที่เหลือ)
- รายการ **ใกล้หมดอายุใน 7 วัน**: trial ที่ `trialEndsAt` ใน 7 วัน + Stripe ที่ `cancelAtPeriodEnd` และ `currentPeriodEnd` ใน 7 วัน
- รายการ **กดยกเลิกแล้วยังไม่หมดรอบ**: `cancelAtPeriodEnd = true` เรียงตาม `currentPeriodEnd`
- ตัวเลขทั้งหมดมาจาก Postgres เท่านั้น · เวลาแสดงด้วย `formatDate` (พ.ศ.) ตามกฎ repo
- procedure ใหม่ `backoffice.overview` (query เดียว `organization.findMany include subscription`)

### หน้า C — ลูกค้าทั้งหมด (ต่อยอด `/admin/customers` เดิม)
- เพิ่มคอลัมน์: **รอบบิล** (`billingInterval` รายเดือน/รายปี) · **วันหมดอายุ** (trial → `trialEndsAt`; Stripe → `currentPeriodEnd`; lifetime → "ไม่มี") · **สมาชิก/เพดาน** (`_count.members(status active)` เทียบ `PLAN_LIMITS[effectivePlan].users`; -1 = ไม่จำกัด) · ป้าย "ยกเลิกสิ้นรอบ" · ป้าย "ทีมงาน" สำหรับ org หลังบ้าน (ไม่นับเป็นลูกค้า)
- ตัวกรองเดิม (ทั้งหมด/จ่ายจริง/ทดลอง/ตลอดชีพ/ฟรี) คงไว้ + เพิ่ม "ใกล้หมดอายุ" และ "ยกเลิกแล้ว"
- แต่ละแถวกดไปหน้า D · ปุ่มให้สิทธิ์/ยกเลิกสิทธิ์เดิมคงไว้ (ไม่ทำซ้ำ)
- `backoffice.accounts` ขยาย field ที่คืน (ไม่เปลี่ยน shape เดิม) · กรอง org หลังบ้านออกจากการนับ "จ่ายจริง"

### หน้า D — รายละเอียดบริษัท `/<route>/[orgId]` (ใหม่)
- **บริษัทและเจ้าของ**: ชื่อ ประเภท (นิติบุคคล/บุคคล) เลขภาษี สาขา วันที่สมัคร เจ้าของ (ชื่อ/อีเมล/LINE) สถานะ onboarding
- **สมาชิก**: รายชื่อ role status joinedAt + คำเชิญค้าง (Invitation pending)
- **แพ็กเกจ**: plan ฐาน / effectivePlan / trial (plan, เริ่ม, หมด) / lifetime / Stripe (customer id, sub id, interval, period end, cancelAtPeriodEnd, status) / quota cache (maxMembers, maxEvents, scanCredits)
- **เครดิต OCR**: `UsageCounter` เดือนปัจจุบัน (metric "ocr") เทียบ `PLAN_LIMITS.ocrPerMonth` + 3 เดือนย้อนหลัง
- **การเชื่อม Google**: `GoogleConnection` ของเจ้าของ: อีเมล Google, `isActive`, `tokenExpiry`, มี spreadsheet/drive id ไหม (แสดง "มี/ไม่มี" เท่านั้น ไม่แสดง id) · ป้าย "ถูกยกเลิก ต้องเชื่อมใหม่" ตรงกับ CO-08
- **LINE**: จำนวนกลุ่ม LINE ที่ผูก (`LineGroup`)
- **ประวัติ**: `AuditLog` ของ org ที่ `entityType in (subscription, invoice, org, member)` 50 รายการล่าสุด (summary + ผู้ทำ + เวลา) — ไม่แสดง log ของรายจ่าย/เอกสาร (มี ref id ของข้อมูลธุรกิจ)
- ปุ่ม: ให้สิทธิ์ / ยกเลิกสิทธิ์ (reuse GrantModal เดิม) · ลิงก์ไป Stripe dashboard (ถ้ามี customer id)
- **อ่านเฉพาะ Postgres** ไม่แตะ Google Sheet (ตามกฎ router เดิม + SYSTEM_REQUIREMENTS)
- procedure ใหม่ `backoffice.orgDetail`

### หน้า E — กำหนดแพ็กเกจแบบวางบิล/โอน (ทำเฉพาะถ้าพี่ตอบข้อ 4 ว่า "มี")
- `backoffice.assignPlan({ orgId, plan, months|until, note })`: ปฏิเสธถ้า `stripeSubscriptionId` และ Stripe status ∈ active/trialing/past_due (ต้นแบบ HR) · เขียน `plan = tier, status = "manual", isBetaTester = false, trialPlan = null, currentPeriodEnd = until, cancelAtPeriodEnd = false` + `quotaCacheFor` · AuditLog ทุกครั้ง
- ต้องแก้ 2 จุดกัน regression: Stripe webhook `updateSubscriptionRow` ต้องไม่ทับแถว `status = "manual"` ที่ไม่มี `stripeSubscriptionId` (ปัจจุบันทับได้ถ้ามี event หลง) · cron `expire-trials` ไม่แตะเพราะไม่ใช่ trial · เพิ่ม cron/เช็กใน `effectivePlan`? — **ไม่แตะ `effectivePlan`** (กฎ) แต่เพิ่มการแสดง "หมดอายุวางบิล" ในหน้า B/C และแจ้งทีมเอง (ไม่ auto-downgrade ในรอบแรก)
- ถ้าตอบ "ไม่มี" → ข้ามทั้งหน้า

## โครงไฟล์ (ถ้าเลือก `/backoffice`)
```
src/app/(app)/backoffice/layout.tsx          ประตู isBackofficeAdmin + เมนูย่อย (ภาพรวม · ลูกค้า)
src/app/(app)/backoffice/page.tsx            หน้า B
src/app/(app)/backoffice/customers/page.tsx  หน้า C (ย้าย client เดิมมา + ขยาย)
src/app/(app)/backoffice/customers/[orgId]/page.tsx  หน้า D
src/app/(app)/admin/customers/page.tsx       redirect → /backoffice/customers
src/lib/auth/backoffice.ts                   isBackofficeAdmin
src/server/routers/backoffice.router.ts      + overview, orgDetail (+ assignPlan ถ้าเลือก)
src/server/trpc.ts                           backofficeProcedure ใช้ helper
src/components/layout/sidebar.tsx            เมนูหลังบ้านไม่ผูกกับบริษัทที่เลือก
scripts/uat_<ts>/backoffice-gate.test.ts     เทสประตู 3 กรณี
```
ไม่ชน `/customers` (ลูกค้าของผู้ใช้) · ไม่แตะ `/admin/affiliate` (สิทธิ์แยกด้วย `AFFILIATE_ADMIN_EMAILS` คงเดิม)

## กติกาที่จะยึด
- Zero Data Retention: ไม่อ่านชีต ไม่ log ข้อมูลธุรกิจ · AuditLog ที่แสดงกรองเฉพาะ entityType ด้านระบบ
- ใช้ `effectivePlan/isInTrial/quotaCacheFor` เดิม ไม่เขียนกติกาซ้ำ · ทุกการให้สิทธิ์มี AuditLog (เดิมมีแล้ว)
- "จ่ายจริง" ไม่นับ org หลังบ้าน, lifetime, trial
- เวลาไทย (`formatDate`) · ข้อความไทย · ทดสอบกับ org ทดสอบ · `tsc` + `lint` + build (Node 20) · push เมื่อสั่ง · เอกสาร `HANDOFF_<ts>.md` ใหม่

## เฟส 2–3 (ยังไม่ทำ รอตัดสินใจ)
- โค้ดทดลองใช้ (`TrialCode`, `TrialCodeRedemption`) และ pipeline ต้อง schema ใหม่ + `db push` + RLS · pipeline ของ HR อยู่คนละ DB → ต้องสร้างใหม่ในฝั่งนี้ (แยกกระดาน) หรือทำ service กลางภายหลัง

## สิ่งที่ต้องให้พี่พิมตัดสินใจ (ตอบสั้น ๆ ได้)
1. **Route**: `/backoffice` (แนะนำ) + redirect จาก `/admin/customers` — หรือขยายของเดิม
2. **ขอบเขตรอบแรก**: เฟส 1 อย่างเดียว (แนะนำ) ใช่ไหม
3. **หน้ารายละเอียดบริษัท**: อ่านเฉพาะ Postgres (แนะนำ) ใช่ไหม — ถ้าอยากเห็นยอดใช้งานจากชีต (เช่น จำนวนรายจ่ายเดือนนี้) ต้องยกเว้นกฎและพี่ยืนยันเป็นลายลักษณ์อักษร
4. **ลูกค้าวางบิล/โอน**: ตอนนี้มีไหม (ระบบรับแต่บัตรผ่าน Stripe) — ถ้า "ยังไม่มี" จะข้ามหน้า E ไปก่อน
5. **Pipeline**: แยกกระดานของ Aim Expense (DB แยกกันอยู่แล้ว) หรือจะรวมในภายหลัง — ตอบได้ทีหลังเพราะอยู่เฟส 2
