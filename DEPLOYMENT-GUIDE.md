# Aim Expense V2 — Deployment Guide

**Target:** Deploy ครั้งแรกไป Vercel (Soft Launch / Staging)
**Last Updated:** 2026-04-21

---

## 📋 ภาพรวม (Overview)

Deploy ครั้งนี้เป็น **Soft Launch** — ยังไม่เปิดให้ public สมัคร แต่จะได้:
- Public HTTPS URL สำหรับ LINE webhook (เลิกใช้ ngrok)
- Production environment สำหรับ dog-food และ test
- Base สำหรับ Phase 4 (Dashboard) + Phase 6 (Billing)

**เวลาที่ใช้รวม:** ประมาณ 1.5–2 ชั่วโมง (รวม create account ต่างๆ)

---

## 🗺️ Roadmap การ deploy (6 ขั้น)

| ขั้น | ชื่อ | เวลา | ต้องการ |
|-----|------|------|---------|
| 1 | เตรียม Git repo (local) | 10 นาที | Terminal |
| 2 | สร้าง GitHub account + private repo | 10 นาที | Email |
| 3 | Push code ขึ้น GitHub | 5 นาที | - |
| 4 | สร้าง Vercel account + Import project | 20 นาที | GitHub |
| 5 | Config external services (Google, LINE) | 30 นาที | Console access |
| 6 | Smoke test | 15 นาที | LINE OA + test user |

---

## ขั้นที่ 1 — เตรียม Git repo (local)

### 1.1 ตรวจสอบว่ามีไฟล์สำคัญครบ
ไฟล์ต่อไปนี้เอมเตรียมให้พี่แล้ว:
- ✅ `.gitignore` — กัน `.env.local` ถูก commit (สำคัญมาก!)
- ✅ `.env.example` — template env vars สำหรับอ้างอิง
- ✅ `vercel.json` — config function timeout + region (sin1 = Singapore)

### 1.2 ตรวจสอบ Node.js version
```bash
node -v
# ควรเป็น v20.x หรือ v22.x (Vercel รองรับทั้งคู่)
```
ถ้ายังไม่มี Node ติดตั้ง → [nodejs.org](https://nodejs.org/) เลือก LTS

### 1.3 Git init + first commit
เปิด Terminal ไปที่ folder `aim-expense/`:

```bash
cd "/Users/pimratraa./Desktop/Mac Cowork/Aim Expense V2/aim-expense"

# ตั้งชื่อ + email สำหรับ git (ครั้งเดียวพอ)
git config --global user.name "Aim Expense"
git config --global user.email "dev@aimexpense.com"

# Init git repo
git init

# เช็คว่า .env.local โดน ignore แล้ว (ต้อง NOT show)
git status | grep ".env.local"
# ↑ ถ้ามีบรรทัดนี้แสดงว่า .gitignore ไม่ทำงาน — STOP! check .gitignore ก่อน

# Add ทุกไฟล์
git add .

# Commit แรก
git commit -m "Initial commit — Aim Expense V2 (Phase 1-3 + LINE integration)"
```

**⚠️ สำคัญ:** ถ้ารัน `git status` แล้วเห็น `.env.local` อยู่ในรายการ — **อย่า commit!** ต้องแก้ `.gitignore` ก่อน

---

## ขั้นที่ 2 — สร้าง GitHub account + repo

### 2.1 สมัคร GitHub (ถ้ายังไม่มี)
1. ไปที่ [github.com/signup](https://github.com/signup)
2. กรอก email `dev@aimexpense.com` (แนะนำใช้ email เดียวกับที่จะใช้ deploy)
3. ตั้ง password + username (แนะนำ: `aim-expense` หรือชื่อบริษัท)
4. Verify email

### 2.2 สร้าง Private Repository
1. Login แล้วกดปุ่ม **"+"** มุมขวาบน → **"New repository"**
2. Repository name: `aim-expense-v2`
3. Description: `Aim Expense V2 — Expense management with LINE integration`
4. **เลือก "Private"** (อย่าเลือก Public! มี business logic)
5. **อย่า** check "Add a README" (เรามี code แล้ว)
6. **อย่า** check "Add .gitignore" (เรามีแล้ว)
7. กด **"Create repository"**

### 2.3 Copy คำสั่ง push
GitHub จะแสดงหน้า instruction — copy commands ในส่วน **"…or push an existing repository from the command line"** มาเตรียมไว้

หน้าตาประมาณ:
```bash
git remote add origin https://github.com/<username>/aim-expense-v2.git
git branch -M main
git push -u origin main
```

---

## ขั้นที่ 3 — Push code ขึ้น GitHub

### 3.1 เชื่อม remote + push

กลับไปที่ Terminal (folder `aim-expense/`):

```bash
# แทน <username> เป็น GitHub username ของพี่
git remote add origin https://github.com/<username>/aim-expense-v2.git
git branch -M main
git push -u origin main
```

### 3.2 Authentication
ครั้งแรก GitHub จะถาม:
- **Username:** GitHub username
- **Password:** ต้องใช้ **Personal Access Token (PAT)** ไม่ใช่ password ปกติ

**วิธีสร้าง PAT:**
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Name: `aim-expense-cli`, Expiration: 90 days
4. Scope: check `repo` (full control of private repositories)
5. Generate → **copy token ทันที** (จะไม่เห็นอีก!)
6. ใช้ token นี้เป็น password

**หรือใช้ GitHub CLI แทน (แนะนำ):**
```bash
brew install gh
gh auth login
# เลือก GitHub.com → HTTPS → Login with web browser
```
หลัง auth แล้ว `git push` จะไม่ถาม password อีก

### 3.3 Verify
ไปที่ GitHub repo ใน browser → ควรเห็นไฟล์ทั้งหมด (แต่ **ต้องไม่เห็น** `.env.local`!)

**⚠️ ถ้าเห็น `.env.local` ใน GitHub:**
1. **Rotate secrets ทันที** (เปลี่ยน GOOGLE_CLIENT_SECRET, LINE secrets, AKSONOCR_API_KEY)
2. ลบ commit ออก + force push
3. ตั้งแต่วินาทีที่ secret ขึ้น GitHub ถือว่า leak แล้ว ต้อง assume worst case

---

## ขั้นที่ 4 — สร้าง Vercel + Import project

### 4.1 สมัคร Vercel
1. ไปที่ [vercel.com/signup](https://vercel.com/signup)
2. เลือก **"Continue with GitHub"** (แนะนำ — sync repo อัตโนมัติ)
3. Authorize Vercel ให้ access GitHub
4. เลือก plan **Hobby (Free)** — ใช้ได้สำหรับ dog-food
   - 100 GB bandwidth/เดือน
   - ไม่จำกัด deploy
   - Function timeout 10s (pro = 60s) — เอมตั้ง `vercel.json` ให้รองรับ 30s ตามขีดจำกัดของ plan ที่ใช้งานจริงได้
5. ให้ข้อมูล team name: `aim-expense` (หรือ personal)

### 4.2 Import GitHub Repository
1. Dashboard Vercel → **"Add New..."** → **"Project"**
2. **"Import Git Repository"** → เลือก `aim-expense-v2`
3. ถ้าไม่เห็น repo → กด **"Adjust GitHub App Permissions"** → ให้ access repo นั้น

### 4.3 Configure Project
**Framework Preset:** Next.js (auto-detect)
**Root Directory:** `./` (ถ้า project อยู่ root ของ repo — กด "Edit" ถ้าอยู่ subfolder)
**Build Command:** `next build` (default OK)
**Output Directory:** `.next` (default OK)
**Install Command:** `npm install` (default OK)
**Node.js Version:** 20.x (แนะนำ)

### 4.4 Environment Variables (สำคัญสุด!)
ใน section **"Environment Variables"** กด **"Add"** ทีละตัว หรือ paste bulk:

**วิธีที่ง่ายที่สุด:**
1. เปิดไฟล์ `.env.local` ในเครื่อง
2. Copy ทั้งไฟล์
3. ใน Vercel ENV section → กดปุ่มเล็กๆ **"Import .env"** → paste
4. Vercel จะแยก key-value ให้อัตโนมัติ

**⚠️ ต้องเปลี่ยนค่า 5 ตัวก่อน deploy** (ตอนนี้ใส่ placeholder ไปก่อน แล้ว update หลัง deploy แรก):
```
APP_BASE_URL=https://placeholder.vercel.app
NEXT_PUBLIC_APP_URL=https://placeholder.vercel.app
NEXTAUTH_URL=https://placeholder.vercel.app
GOOGLE_REDIRECT_URI=https://placeholder.vercel.app/api/auth/google/callback
LINE_CALLBACK_URL=https://placeholder.vercel.app/api/auth/line/callback
```

**Environment เลือก:** `Production`, `Preview`, `Development` (tick ทั้ง 3 สำหรับ secrets ที่ใช้เหมือนกัน)

### 4.5 Deploy!
กด **"Deploy"** → รอ 2–4 นาที

**ถ้า build fail:**
- ดู log บอกบรรทัดที่ fail
- ส่วนใหญ่เป็น: missing env var, prisma generate issue, TypeScript error
- ถ้า prisma fail → ตรวจ `DATABASE_URL` pool connection

### 4.6 เอา URL มา
Deploy สำเร็จ → Vercel ให้ URL เช่น `aim-expense-v2-xxx.vercel.app`

**📝 จด URL นี้ไว้** (เราจะใช้ใน step 5)

### 4.7 Update env vars เป็น URL จริง
Vercel Project → **Settings** → **Environment Variables** → แก้ 5 ตัวที่เป็น placeholder ให้เป็น URL จริง:
```
APP_BASE_URL=https://aim-expense-v2-xxx.vercel.app
NEXT_PUBLIC_APP_URL=https://aim-expense-v2-xxx.vercel.app
NEXTAUTH_URL=https://aim-expense-v2-xxx.vercel.app
GOOGLE_REDIRECT_URI=https://aim-expense-v2-xxx.vercel.app/api/auth/google/callback
LINE_CALLBACK_URL=https://aim-expense-v2-xxx.vercel.app/api/auth/line/callback
```
หลังแก้ → **Deployments** tab → กดปุ่ม **"Redeploy"** บน latest deployment

---

## ขั้นที่ 5 — Config External Services

### 5.1 Google Cloud Console (OAuth)
1. ไปที่ [console.cloud.google.com](https://console.cloud.google.com/) → เลือก project ของพี่
2. เมนูซ้าย → **APIs & Services** → **Credentials**
3. หา OAuth 2.0 Client ID ที่ใช้ (ที่ CLIENT_ID ตรงกับของพี่) → กด edit
4. ในส่วน **Authorized redirect URIs** → **ADD URI**:
   - `https://aim-expense-v2-xxx.vercel.app/api/auth/google/callback`
   - (ของเดิม `http://localhost:3000/api/auth/google/callback` เก็บไว้ได้ — ใช้ dev)
5. กด **Save**

### 5.2 LINE Login Console
1. ไปที่ [developers.line.biz/console](https://developers.line.biz/console/)
2. เลือก Provider → เลือก **LINE Login channel** (ID 2009801571)
3. Tab **"LINE Login"** → **Callback URL**:
   - เพิ่ม `https://aim-expense-v2-xxx.vercel.app/api/auth/line/callback`
   - เก็บ `http://localhost:3000/...` ไว้ (สำหรับ dev)
4. **Update**

### 5.3 LINE Messaging API Console (Webhook)
1. เลือก **LINE Messaging API channel** (ID 2009801545)
2. Tab **"Messaging API"** → **Webhook URL**:
   - ใส่: `https://aim-expense-v2-xxx.vercel.app/api/line/webhook`
   - **Use webhook:** Enabled ✓
   - **Auto-reply messages:** Disabled (ให้ app ตอบเอง)
   - **Greeting messages:** Disabled (optional)
3. กด **"Verify"** → ต้องขึ้น **"Success"**
   - ถ้า fail → ตรวจว่า Vercel deploy สำเร็จแล้ว + env `LINE_MESSAGING_CHANNEL_SECRET` ถูกต้อง
4. **Update**

### 5.4 Supabase (Production Pooler)
Supabase DATABASE_URL ที่พี่ใช้อยู่ `aws-1-ap-southeast-1.pooler.supabase.com:5432` เป็น **Session Pooler** — พอสำหรับ Vercel

**(Optional)** ถ้าเจอ "too many connections" ใน log → เปลี่ยนเป็น **Transaction Pooler** (port 6543) — Supabase Dashboard → Settings → Database → Connection Pooling

---

## ขั้นที่ 6 — Smoke Test

### 6.1 Test หน้าเว็บ
เปิด `https://aim-expense-v2-xxx.vercel.app` ใน browser
- ✓ Landing page โหลด
- ✓ กด Login → ไป Google OAuth → redirect กลับมาสำเร็จ
- ✓ Dashboard โหลด (ยังไม่มี Phase 4 — แสดงหน้าว่างได้)

### 6.2 Test LINE Login
- ✓ Login ด้วย LINE → redirect กลับสำเร็จ

### 6.3 Test LINE Webhook
1. Add OA `@064qycfu` เป็นเพื่อนใน LINE
2. ส่งรูปใบเสร็จ
3. ควรได้ Flex card ตอบกลับภายใน 10-15 วินาที
4. ใน Vercel **Functions** tab → ดู log `/api/line/webhook` ว่า execute สำเร็จ

### 6.4 Test Payment Flow
- เข้าเว็บ → `/expenses` → สร้างรายการ → upload ใบเสร็จ → save
- ตรวจว่า Google Sheet มี row ใหม่ + Google Drive มีไฟล์ใหม่

### 6.5 Check Logs
Vercel → **Logs** tab → ดูว่ามี error อะไรบ้าง
- 4xx OK ถ้าเป็น auth redirect ปกติ
- 5xx = server error → ดู detail

---

## 🎯 Post-deploy Checklist

- [ ] `.env.local` ไม่อยู่ใน GitHub (check: `https://github.com/<user>/aim-expense-v2` → search `.env.local`)
- [ ] Google OAuth redirect URI อัปเดตแล้ว
- [ ] LINE Login callback URL อัปเดตแล้ว
- [ ] LINE Messaging webhook URL อัปเดตแล้ว + Verify success
- [ ] Login ผ่าน Google ใช้ได้
- [ ] Login ผ่าน LINE ใช้ได้
- [ ] LINE OA ตอบ Flex card ได้
- [ ] สร้าง payment + upload receipt ใช้ได้
- [ ] Supabase connection ไม่มี error "too many connections"

---

## 🚨 Troubleshooting

### Build fails: "Prisma schema not found"
- ตรวจว่า `prisma/schema.prisma` commit ขึ้น git แล้ว
- `package.json` ต้องมี `"postinstall": "prisma generate"` (มีอยู่แล้ว ✓)

### LINE webhook verify fail
- ตรวจ `LINE_MESSAGING_CHANNEL_SECRET` ใน Vercel env ตรงกับ LINE Console
- ดู Vercel Functions log

### Google OAuth: "redirect_uri_mismatch"
- URL ใน Vercel env ต้องตรงเป๊ะกับที่ลงทะเบียนใน Google Cloud Console (ทั้ง http/https, trailing slash)

### Function timeout 10s
- Hobby plan = 10s, ถ้าเกิน → upgrade Pro ($20/month) หรือ optimize OCR call
- `vercel.json` เอมตั้ง 30s แต่ใช้ได้เฉพาะ Pro

### Database connection limit
- Supabase free tier = 60 connections → ใช้ **Transaction Pooler** (port 6543)

---

## 🌐 (Optional) Custom Domain

หลัง soft launch สักพัก ถ้าอยากได้ `aimexpense.com`:

1. ซื้อ domain (Namecheap / Cloudflare / GoDaddy)
2. Vercel → Project → Settings → **Domains** → Add
3. เพิ่ม DNS record ที่ registrar ตามที่ Vercel แจ้ง (CNAME หรือ A record)
4. Vercel auto-provision SSL ภายใน 24 hours (ปกติ 5-30 นาที)
5. Update env vars ทั้ง 5 ตัว (APP_BASE_URL, ...) + Google OAuth + LINE callbacks

---

## 💡 Tips

- **Preview deployments** — ทุกครั้ง push ไป branch อื่น (ไม่ใช่ main) Vercel จะสร้าง preview URL ให้อัตโนมัติ เหมาะสำหรับ test ก่อน merge
- **Auto-deploy จาก main** — push main → Vercel deploy อัตโนมัติภายใน 2-3 นาที
- **Rollback** — ใน Deployments tab กดปุ่ม **"Promote to Production"** บน deployment เก่าได้ทันที
- **Env per environment** — ต่อไปถ้าแยก staging/prod ใช้ Vercel environments ได้ (Hobby plan มี 3 environments)

---

## 📞 ถ้าติดตรงไหน

บอกเอมได้เลยค่ะ ระบุให้ชัด:
1. ขั้นไหน ข้อย่อยไหน
2. Error message เต็มๆ (copy-paste)
3. Screenshot ถ้ามี

เอมจะช่วย debug ทีละ step ค่ะ
