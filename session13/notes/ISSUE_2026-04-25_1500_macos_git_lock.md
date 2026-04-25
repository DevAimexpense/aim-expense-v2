# Issue Note — macOS Apple Service holds .git/ lock

> **Created:** 2026-04-25 15:00 ICT
> **Severity:** 🔴 Blocker — git operations ที่เขียน index fail ทุกครั้ง
> **Affects:** เฉพาะ workflow ที่ folder อยู่ใน `~/Desktop/...` (default macOS iCloud sync location)

---

## 🐛 Symptoms

1. `rm .git/index.lock` ลบได้สำเร็จ (Terminal บอก "No such file or directory" ในครั้งถัดไป)
2. แต่ทันทีที่รัน `git add` / `git commit` / `git status` ใน sandbox — lock ถูกสร้างใหม่
3. Error: `fatal: Unable to create '.git/index.lock': File exists`
4. หรือ silent fail — `git add -A` exit 0 แต่ไม่ stage จริง (`git status` ยังเห็น "Changes not staged")

---

## 🔍 Diagnosis

`lsof +D .git/` output (จากพี่):

```
com.apple PID 982  hold .git/, .git/objects/, .git/refs/, .git/info/, .git/hooks/,
                       .git/HEAD, .git/info/exclude, .git/objects/01, .git/objects/4b,
                       .git/objects/6b, .git/objects/74, .git/objects/f9, ...
```

PID 982 = Apple system service ที่ scan/hold `.git/` ตลอดเวลา → race condition กับ git CLI write operations

**คาดเดาตัวการ (เรียงโอกาส):**
1. **iCloud Drive sync** — `bird` / `cloudd` / `fileproviderd` (folder ที่ `~/Desktop` = sync default)
2. **Spotlight indexer** — `mds` / `mdworker_shared`
3. **Time Machine** — `backupd`
4. **Antivirus / EDR** — ถ้ามีติดตั้ง

ยังไม่ได้ confirm — ต้องรัน `ps -p 982 -o comm` ใน Session 14

---

## 🛠 Workarounds (เรียงจากเร็วสุด → ระยะยาว)

### 1️⃣ Cursor Source Control GUI ⭐ แนะนำลองก่อน

Cursor (และ VSCode) ใช้ libgit2 bundled — ไม่ผ่าน system git CLI → bypass lock issue ได้เกือบทุกครั้ง

**ขั้นตอน:**
1. เปิด Cursor → Open Folder → `aim-expense`
2. กด `Cmd + Shift + G` (Source Control panel)
3. เห็น 3 ไฟล์ modified — กด `+` ที่ "Changes" header (stage all)
4. Commit message: `fix(line): flexible UserID match + EventID whitespace tolerance`
5. กด `✓ Commit` → กด `Sync` (หรือ `...` → Push)

### 2️⃣ ฆ่า process ที่ hold lock

```bash
ps -p 982 -o comm                              # confirm name
sudo killall <process_name>                    # may auto-restart
cd "/Users/pimratraa./Desktop/Mac Cowork/Aim Expense V2/aim-expense"
rm -f .git/index.lock && git add -A && git commit -m "..." && git push
```

⚠️ Apple services มักถูก auto-restart โดย launchd → workaround ชั่วคราวเท่านั้น

### 3️⃣ ปิด iCloud Desktop sync

System Settings → Apple ID → iCloud → iCloud Drive → Options → ❎ "Desktop & Documents Folders"

⚠️ ผลกระทบ: ไฟล์ทุกตัวบน Desktop จะหยุด sync — ถ้าพี่พึ่ง iCloud backup ของไฟล์ desktop อื่น ๆ จะไม่ได้

### 4️⃣ ย้าย repo ออกจาก Desktop ⭐ แนะนำระยะยาว

```bash
mkdir -p ~/Code
mv "/Users/pimratraa./Desktop/Mac Cowork/Aim Expense V2" ~/Code/aim-expense-v2
cd ~/Code/aim-expense-v2/aim-expense
git status   # should be clean of lock issues
```

⚠️ Cowork mode ผูก path เดิม — ต้องเลือก folder ใหม่ใน Cowork settings หลังย้าย

### 5️⃣ Spotlight Privacy exclusion (ถ้าเป็น mds)

System Settings → Siri & Spotlight → Spotlight Privacy → `+` → เพิ่ม `aim-expense/.git`

(ใช้ได้ถ้า PID 982 = `mds` หรือ `mdworker_shared` — ถ้าเป็น iCloud ไม่ช่วย)

---

## 📌 Root Cause ที่แท้จริง — Best Practice

**Git repo ไม่ควรอยู่ใน folder ที่ถูก sync ระดับไฟล์** — เพราะ:
- iCloud / Dropbox / OneDrive เปิด FD ค้าง → ติด lock
- File-level sync เห็น `.git/objects/*` (หลายพันไฟล์เล็ก) → sync ไม่จบ
- Conflict ระหว่าง 2 เครื่องอาจ corrupt index/objects

**Recommended:** เก็บ repo ใน `~/Code/`, `~/Projects/`, `~/Documents/` (ไม่อยู่ใน Desktop) — folder เหล่านี้ไม่ติด iCloud Desktop sync

---

## 📊 Timeline

| เวลา (ICT) | เหตุการณ์ |
|-----------|-----------|
| 14:00 | เริ่ม Session 13, OCR ทำงานดี — picker หาย |
| 14:30 | Diagnose Vercel log → 0 assignments → root cause Prisma user.id mismatch |
| 14:45 | Apply patch 3 ไฟล์ + type check ผ่าน |
| 14:50 | พี่รัน `git add -A` → silent fail |
| 14:55 | เจอ index.lock ค้าง → พี่ rm ลบได้ |
| 14:56 | พี่รัน `git add -A` ใหม่ → ยังเป็น "Changes not staged" |
| 14:58 | เจอ PID 982 hold `.git/` ผ่าน lsof |
| 15:00 | เขียน handoff สำหรับ Session 14 |

---

*Issue note by Aim — 2026-04-25 15:00 ICT*
