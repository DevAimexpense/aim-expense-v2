# Session 13 → Session 14 — Handoff (Pre-commit Snapshot)

> **Created:** 2026-04-25 15:00 ICT (เตรียมไว้ก่อน commit สำเร็จ — pre-emptive)
> **Status:** 🔴 **BLOCKED** — patch แก้แล้ว, type check ผ่าน, แต่ commit ไม่สำเร็จเพราะ macOS file lock
> **Patch state:** Code อยู่ในไฟล์จริง (3 files modified) — `git status` เห็น แต่ `git add` fail

---

## 🎯 ที่ทำใน Session 13 (สรุปสั้น)

### ✅ สำเร็จ
1. **Verify Session 12 push state** — commit `6e9b1cb` อยู่บน main + remote ตรงกัน 100%
2. **Smoke test LINE OA** หลัง Session 12 deploy:
   - ✅ OCR Layer 1+2 ทำงานดี — buyer "บริษัท อาร์โต จำกัด" auto-correct จาก Config sheet สำเร็จ
   - ❌ Flex Carousel project picker ไม่แสดง — fallback ไป "LINE Quick Capture" event อัตโนมัติ
3. **Diagnose root cause** ของ picker regression:
   - Vercel log: `[LINE] Project picker: 0 assigned-active (of 2 events, 0 assignments) — statuses: "active"`
   - **0 assignments** = `getEventIdsAssignedToUser(ctx.user.id)` คืน `[]` แม้พี่จะเห็น UserID ของตัวเองใน `EventAssignments` tab
   - **Root cause:** `getFiltered` ใช้ `===` (exact match) — Prisma `user.id` (UUID `333d8b87-...`) **ไม่ตรงกับ** value ใน sheet ที่อาจเป็น email/lineUserId/displayName
4. **Implement code patch (3 ไฟล์, +64/-7 lines)** + type check ผ่าน 0 errors

### 🔴 ยังไม่สำเร็จ — Blocked
- **Commit + Push:** ติด `.git/index.lock` ค้างที่ Apple system service (PID 982) hold ตลอดเวลา (น่าจะเป็น iCloud Drive sync หรือ Spotlight indexer ของ macOS)
- **Vercel deploy ใหม่:** ยังไม่เกิด — เพราะ commit ไม่เข้า GitHub

---

## 📦 Code Changes ค้างใน Working Dir (ยังไม่ commit — สำคัญ!)

### File 1 — `src/server/services/google-sheets.service.ts`

**Before:**
```ts
async getEventIdsAssignedToUser(userId: string): Promise<string[]> {
  const all = await this.getFiltered(SHEET_TABS.EVENT_ASSIGNMENTS, "UserID", userId);
  return all.map((a) => a.EventID).filter(Boolean);
}
```

**After:** Flexible match — รับ user object และเทียบกับทุก identifier (id/email/lineUserId/displayName) แบบ case-insensitive + trim + เพิ่ม diagnostic log ถ้าไม่ match

```ts
async getEventIdsAssignedToUser(
  user: string | { id: string; email?: string | null; lineUserId?: string | null; lineDisplayName?: string | null },
): Promise<string[]> {
  const candidates = new Set<string>();
  const add = (v?: string | null) => {
    if (!v) return;
    const t = String(v).trim();
    if (t) candidates.add(t.toLowerCase());
  };
  if (typeof user === "string") add(user);
  else { add(user.id); add(user.email); add(user.lineUserId); add(user.lineDisplayName); }

  const all = await this.getAll(SHEET_TABS.EVENT_ASSIGNMENTS);
  const matched = all.filter((row) => {
    const cell = String(row.UserID || "").trim().toLowerCase();
    return cell.length > 0 && candidates.has(cell);
  });

  if (matched.length === 0 && all.length > 0) {
    const sampleUserIds = [...new Set(all.slice(0, 5).map((r) => String(r.UserID || "")))]
      .map((v) => JSON.stringify(v));
    console.warn(
      `[Sheets] EventAssignments: 0 rows matched ${candidates.size} candidate identifier(s) ` +
        `(of ${all.length} total rows). Sample UserIDs in sheet: ${sampleUserIds.join(", ")}`,
    );
  }

  return matched.map((a) => String(a.EventID || "").trim()).filter(Boolean);
}
```

### File 2 — `src/lib/line/user-org.ts`

เพิ่ม `email` field ใน `LineUserContext.user`:

```ts
// Interface — เพิ่ม email
export interface LineUserContext {
  user: {
    id: string;
    email: string | null;          // ← NEW
    lineUserId: string;
    lineDisplayName: string;
    onboardingStep: string;
  };
  orgId: string;
  orgName: string;
}

// Prisma select — เพิ่ม email
const user = await prisma.user.findUnique({
  where: { lineUserId },
  select: {
    id: true,
    email: true,                   // ← NEW
    lineUserId: true,
    lineDisplayName: true,
    onboardingStep: true,
  },
});
```

### File 3 — `src/lib/line/handlers.ts`

**Change 1:** Type ของ `ctx` parameter ของ `processMediaAsync` เพิ่ม email/lineUserId/lineDisplayName

**Change 2:** ส่ง `ctx.user` (object) ไปแทน `ctx.user.id`:
```ts
sheets.getEventIdsAssignedToUser(ctx.user),  // was: ctx.user.id
```

**Change 3:** Trim EventID ทั้งสองฝั่งของ Set membership check:
```ts
const assignedSet = new Set(assignedEventIds.map((id) => id.trim()));
// ...
.filter((e) =>
  (e.Status || "").trim().toLowerCase() === "active" &&
  assignedSet.has((e.EventID || "").trim()),
)
```

---

## 🚧 Git Lock Issue — Diagnosis เต็ม

### Symptoms
- `git add -A` exits 0 แต่ไม่ stage จริง — `git status` ยังเห็น "Changes not staged"
- บางครั้ง `fatal: Unable to create '.git/index.lock': File exists`
- `rm .git/index.lock` ลบได้ใน Terminal ของพี่ — แต่ถูกสร้างใหม่ทันทีเมื่อ git operation ถัดไปรัน

### Root Cause (จาก lsof output ของพี่)
```
com.apple PID 982  hold .git/, .git/objects/, .git/refs/, .git/info/, .git/hooks/, ...
```

PID 982 = Apple system service ที่ scan `.git/` folder ตลอดเวลา → race condition กับ git CLI

**คาดว่าเป็น:**
- iCloud Drive sync (`bird` / `cloudd` / `fileproviderd`) — folder อยู่ใน `Desktop/Mac Cowork/...` = default sync location
- หรือ Spotlight indexer (`mds` / `mdworker_shared`)

**ยังไม่ได้ confirm ชื่อ process** — ต้องรัน `ps -p 982 -o comm`

### Workaround ที่ลองแล้ว
- ❌ `rm .git/index.lock` — ลบได้ แต่ถูกสร้างใหม่ทันที
- ❌ `git add -A` หลายครั้ง — silent fail
- ⏳ **ยังไม่ลอง:** Cursor Source Control GUI (libgit2, bypass system git)
- ⏳ **ยังไม่ลอง:** ปิด iCloud Desktop sync
- ⏳ **ยังไม่ลอง:** ย้าย repo ออกจาก Desktop ไปที่ `~/Code/` หรือ `~/Documents/projects/`
- ⏳ **ยังไม่ลอง:** เพิ่ม folder ใน Spotlight Privacy list

---

## 🚀 Action Items สำหรับ Session 14 (เริ่มจากนี่!)

### A. แก้ปัญหา git lock (เลือก 1 ใน 4 ทาง — เรียงจากเร็วที่สุด)

#### ทาง 1 — Cursor Source Control GUI (เร็วสุด, ไม่ต้องตั้งระบบใหม่)

1. เปิด Cursor → File → Open Folder → `aim-expense`
2. กด `Cmd + Shift + G` (Source Control)
3. เห็น 3 ไฟล์ modified — กด `+` ที่ "Changes" header (stage ทั้งหมด)
4. ใส่ commit message: `fix(line): flexible UserID match + EventID whitespace tolerance`
5. กด `✓ Commit` → กด `Sync` (หรือ `...` → Push)

Cursor ใช้ libgit2 bundled — ไม่ติด lock จาก Apple service

#### ทาง 2 — ระบุ + ฆ่า process แล้ว commit ทันที

```bash
ps -p 982 -o comm                                  # confirm name
sudo killall <process_name>                        # kill (อาจถูก restart)
cd "/Users/pimratraa./Desktop/Mac Cowork/Aim Expense V2/aim-expense"
rm -f .git/index.lock && git add -A && git commit -m "fix(line): flexible UserID match + EventID whitespace tolerance" && git push
```

#### ทาง 3 — ปิด iCloud Desktop sync (5 นาที)

System Settings → Apple ID → iCloud → iCloud Drive → Options → ปิด "Desktop & Documents Folders" → รอ 30-60s → commit

#### ทาง 4 — ย้าย repo (best practice ระยะยาว)

```bash
mkdir -p ~/Code
mv "/Users/pimratraa./Desktop/Mac Cowork/Aim Expense V2" ~/Code/aim-expense-v2
cd ~/Code/aim-expense-v2/aim-expense
git status   # ไม่ติด lock อีกแล้ว
```

⚠️ **Note:** Cowork ผูกกับ path เดิม — ต้องเลือก folder ใหม่ใน Cowork settings ถ้าย้าย

### B. หลัง commit + push สำเร็จ

1. ตรวจ Vercel Deployments → commit hash ใหม่ → status "Ready"
2. ส่งใบเสร็จ Grande Centre Point Pattaya เข้า LINE OA อีกครั้ง
3. **คาดหวัง:** มี Flex Carousel ขึ้นให้เลือก project (swipe ได้)
4. ดู Vercel log:
   - ✅ ที่ดี: `[LINE] Project picker: N assigned-active (of 2 events, K assignments)` — N>0
   - ⚠️ ถ้ายัง 0: log ใหม่ `[Sheets] EventAssignments: 0 rows matched 4 candidate identifier(s) — Sample UserIDs in sheet: "...", "..."` → จะรู้ว่า sheet ใส่ค่าอะไร

### C. ถ้า diagnostic log บอก "Sample UserIDs in sheet: ..." ที่ไม่ตรงกับ id/email/lineUserId/displayName

→ ขอแก้ **data ใน sheet** แทน — เปิด `EventAssignments` tab ใส่ UUID `333d8b87-8b59-492f-b684-ee41c57768f8` ใน column `UserID` row ของพี่

### D. ถ้าทุกอย่างผ่าน → เริ่ม Phase 4 Session 12A (Shared Components)

ตามแผน HANDOFF.md เดิม:
- StatCard, DataTable, DateRangePicker, ExportButton

---

## 📋 Reference: User & Org Info (จาก Prisma DB ที่เอม query)

```
User (พี่):
  id              = 333d8b87-8b59-492f-b684-ee41c57768f8  (UUID, ไม่ใช่ cuid)
  email           = dev@aimexpense.com
  lineUserId      = Ua42c7d7729c56f8eab021918c168761c
  lineDisplayName = AoR
  onboardingStep  = done

Org:
  id   = 32e5a820-ddb1-4850-95f3-b226d4e3a3e2
  name = บริษัท อาร์โต จำกัด
  slug = org-1776216850926
```

→ EventAssignments row ของพี่ ควรใส่ค่า `UserID` เป็นค่าใดค่าหนึ่งใน 4 ตัวนี้:
- `333d8b87-8b59-492f-b684-ee41c57768f8`
- `dev@aimexpense.com`
- `Ua42c7d7729c56f8eab021918c168761c`
- `AoR`

(หลัง patch ใหม่ deploy — ทั้ง 4 ค่ารองรับหมด)

---

## 🔄 Git State ตอนเขียน Handoff นี้

```
Branch: main
HEAD (local)  = 6e9b1cb feat: OCR improvements + Flex Carousel project picker
HEAD (remote) = 6e9b1cb (ตรงกัน — patch ใหม่ยังไม่ commit/push)
Working dir:
  M src/lib/line/handlers.ts
  M src/lib/line/user-org.ts
  M src/server/services/google-sheets.service.ts
Type check: ✅ 0 errors (npx tsc --noEmit)
```

---

## 🧹 Cleanup ค้างจาก Session 11+12 (ยังต้องทำ)

```bash
rm src/lib/ocr/pdf-to-png-server.ts
rm -rf src/app/api/webhook
rm -rf src/app/documents/wth-cert
git add -A && git commit -m "chore: remove dead Phase 5 files" && git push
```

---

## 📝 Session 14 Prompt — ใช้ตอนเริ่ม session ใหม่

```
สวัสดีค่ะเอม นี่คือ session ต่อจาก Session 13

📖 อ่าน context ตามลำดับ:
1. aim-expense/session13/handoff/HANDOFF_2026-04-25_1500_BLOCKED-BY-GIT-LOCK.md
2. aim-expense/session12/handoff/HANDOFF_2026-04-25_1240_BEFORE-NEW-SESSION.md
3. aim-expense/session12/notes/CORRECTION_2026-04-25_1140_buyer_name_arto_not_ardo.md
4. aim-expense/HANDOFF.md (Session 11)

🎯 สถานะ ณ จบ Session 13:
- Code patch แก้แล้ว 3 ไฟล์ (+64/-7) — flexible UserID match + EventID trim
- Type check ผ่าน 0 errors
- 🔴 BLOCKED: commit ไม่สำเร็จ — Apple service hold .git/ folder lock
- ยังไม่มี deploy ใหม่บน Vercel

🚀 งาน Session 14:
1. แก้ git lock issue (Cursor GUI / kill process / ปิด iCloud / ย้าย repo)
2. Commit + push patch
3. ตรวจ Vercel deploy → Ready
4. เทส LINE OA — คาดหวัง Flex Carousel ขึ้น
5. ถ้า diagnostic log ขึ้น "Sample UserIDs in sheet" → fix data ใน sheet
6. ถ้าผ่าน → เริ่ม Phase 4 Session 12A (Shared Components)
```

---

*Handoff by Aim — 2026-04-25 15:00 ICT (pre-commit snapshot)*
