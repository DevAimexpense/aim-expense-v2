# ADR-001 — Redis Cache Layer for Google Sheets Reads

> **Status:** Accepted (Session 25, 2026-05-09)
> **Author:** Claude (S25A) + Aim Dev
> **Supersedes:** None
> **Affects:** SYSTEM_REQUIREMENTS.md principle 3 ("Reports = read-only aggregation, ห้ามเก็บ snapshot/cache")

---

## Context

ปัจจุบัน Aim Expense ทุก request ที่อ่านข้อมูลธุรกิจ (รายการจ่าย, ลูกค้า, ใบเสนอราคา ฯลฯ) จะเรียก
Google Sheets API ของ user ตรง ๆ ผ่าน `GoogleSheetsService.getAll(tab)` ทุกครั้ง.

ที่ scale ปัจจุบัน (1 dev + smoke testing) ทำได้ราบรื่น แต่ก่อน soft launch (1,000+ users) มีปัญหา:

1. **Sheets API quota** — default 300 read/min/project. ถ้ามี 100 concurrent users ที่กดเข้า list page
   ก็เต็ม quota ภายในไม่กี่วินาที. แม้พี่ขอ quota เพิ่มเป็น 3,000 read/min ไปแล้ว (รออนุมัติจาก Google
   ตั้งแต่ 2026-05-03) แต่ก็ยัง bottleneck ที่ ~100 RPS.
2. **Latency** — ทุก list page = 200-400ms รอ Sheets API response. ลูกค้าเปิดหลายหน้าต่อกัน = หน่วง.
3. **Cost-per-request** — Sheets API ฟรี แต่ Vercel Lambda billed per second; ลด API wait ลง = ลด lambda
   wall-time = ลด bill.

แนวทางที่พิจารณา:
1. **In-memory cache (LRU)** — ใน Lambda แต่ละ instance — ❌ Vercel auto-scale ทำให้ instances ไม่
   share state, invalidate cross-instance ไม่ได้
2. **Per-user CDN cache** — ❌ ข้อมูลเป็น private per-org ไม่สามารถ cache ใน edge ได้
3. **Vercel KV** — ✅ functional แต่ vendor lock-in กับ Vercel, free tier 30K req/month จำกัด
4. **Upstash Redis** — ✅ HTTPS-based (เหมาะ Vercel serverless ไม่มี connection pool issues),
   free tier 10K commands/day, $0.20/100K, ไม่ vendor lock-in. **เลือกอันนี้.**

---

## Decision

**ใส่ Redis cache layer ที่ service layer ของ `GoogleSheetsService`** (ไม่ใช่ที่ router layer):

- `getAll(tabName)`, `getAllBatch(tabNames)`, `getConfigMap()` → cache key `sheets:{spreadsheetId}:tab:{tabName}` หรือ `sheets:{spreadsheetId}:config-map`
- TTL = **30 วินาที** (constant `SHEETS_TTL_SEC` ใน `src/server/lib/cache.ts`)
- Write methods (`appendRow*`, `updateById`, `deleteById`, `setConfig`) → invalidate tab key หลังเขียนสำเร็จ
- ถ้า `UPSTASH_REDIS_REST_URL/TOKEN` ไม่มี environment variables → fall back ไปอ่าน Sheets API ตรง ๆ
  (cache เป็น optional dependency, ระบบใช้ได้ปกติแม้ไม่มี Redis)
- Cache failures (Redis down) → log warning + ใช้ Sheets API แทน — **never break the request path**

**ไม่ cache:**
- Aggregation results (report.expenseSummary, report.vat, ฯลฯ) — เพราะคำนวณจาก raw rows ที่ cached แล้ว
- เอกสาร PDF, ไฟล์, attachment — generate fresh ทุกครั้งจาก Drive
- Decrypted OAuth tokens — มี in-memory cache อยู่แล้วใน `sheets-context.ts` (4-min TTL, ไม่ใช่ business data)

---

## Override of SYSTEM_REQUIREMENTS Principle 3

หลักการเดิม (SYSTEM_REQUIREMENTS.md §3): _"ห้ามเก็บ snapshot / cache ของ aggregation ในระบบเรา"_

การ cache row data ใน Redis ขัดกับตัวอักษรของหลักการ. แต่เจตนาของหลักการคือ:

| เจตนาเดิม | สิ่งที่เราทำ |
|----------|-------------|
| ห้ามเก็บข้อมูลธุรกิจที่ Postgres ของระบบเรา | ✅ ยังไม่เก็บ — Postgres มีแค่ infra metadata |
| ห้ามเก็บ aggregation snapshot ที่ stale ได้นาน | ✅ TTL 30s + invalidate on write — staleness window สั้นมาก |
| User เป็นเจ้าของข้อมูล 100% | ✅ ข้อมูลต้นฉบับยังอยู่ที่ Google Sheets ของ user; Redis เป็นแค่ฉบับชั่วคราว |
| User สามารถลบข้อมูลตัวเองได้ผ่าน Drive | ✅ ลบ row ใน Sheet → write path invalidates Redis → cache เคลียร์ภายใน 30s แม้ลบจาก Sheet UI ตรง |

ข้อแลก:
- 🟡 **Eventual consistency window 30s** — ถ้า user A อัปเดต row จาก Sheets UI ตรง (ไม่ผ่าน app) และ user B ดู
  ในแอป, B จะเห็นข้อมูลเก่าได้สูงสุด 30s. ถือว่ายอมรับได้สำหรับ MVP — เป็น tradeoff ที่ document ไว้.
- 🟡 **PII ถูกเก็บชั่วคราวใน Upstash** — ชื่อลูกค้า, เลขผู้เสียภาษี, ที่อยู่ — TLS encrypted in transit, encrypted at rest by Upstash, TTL 30s. เพิ่มเป็น sub-processor ใน Privacy Policy + DPA.
- 🟡 **Scaling ก็ยัง bottleneck ที่ Sheets API quota** สำหรับ writes — แต่ writes น้อยกว่า reads มาก
  (~10:1 ratio) จึง cache reads = ครอบคลุม >90% ของ traffic.

---

## Consequences

### Positive

- **Throughput** — list page TTL hit = ~30-80ms (Redis round-trip) แทน 250-400ms (Sheets API)
- **Quota safe** — 1 read/30s ต่อ tab ต่อ org → ที่ 1,000 active orgs ใช้แค่ ~2,000 read/min ของ Sheets quota
- **Lambda cost** — ลด wall-time ของ tRPC procedure ที่ cache hit ลง ~80% → bill ลดลง
- **Multi-instance correctness** — Redis เป็น shared state; instance A invalidate, instance B เห็นทันที

### Negative / Risks

- **Privacy impact** — PII ผ่านมือ Upstash. Mitigation: เพิ่ม Upstash ใน sub-processor list, ระบุใน Privacy Policy + DPA, TTL 30s
- **Vendor dependency** — ระบบ depend on Upstash availability. Mitigation: fail-open design — Redis down ≠ app down
- **30s staleness window** — direct-Sheets-edits ไม่ propagate ทันที. Mitigation: documented; expected behavior
- **Redis bill** — free tier 10K commands/day ≈ 1,000 active orgs × 1 read/30s × 8 hr = 960,000 commands/day → **เกิน free tier**.
  Upgrade to Pay-as-you-go ($0.20/100K) ≈ **$2/day at 1K orgs** = $60/month. ยอมรับได้.

### Neutral

- ต้อง invalidate ทุก write path — implemented at service layer (single point) เพื่อ guarantee no missed writes
- เพิ่ม dependency `@upstash/redis` (3 KB minified, no native bindings)

---

## Implementation

### Files

- `src/server/lib/cache.ts` — Redis client + helpers (`getOrFetch`, `invalidate`, `invalidateTab`, `mgetCache`, `msetCache`)
- `src/server/services/google-sheets.service.ts` — wraps `getAll`, `getAllBatch`, `getConfigMap`; calls `invalidateTab` after every write
- `package.json` — adds `@upstash/redis ^1.38.0`
- `.env.local` — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Vercel env (deploy time) — same two vars

### Cache key schema

```
sheets:{spreadsheetId}:tab:{tabName}      → array of row records (JSON)
sheets:{spreadsheetId}:config-map         → key→value map (JSON)
```

`spreadsheetId` is the Google Drive ID (per-org, globally unique). No user-id prefix needed because
each user's data lives in their own spreadsheet.

### Tunable

- `SHEETS_TTL_SEC = 30` — start conservative; can raise to 60-120s once we monitor staleness complaints
- `SHEET_TABS.CONFIG` triggers extra invalidation of `config-map` key (materialised view)

---

## Validation

Smoke test before declaring "done":

1. First load `/quotations` (cache miss) → ~250-400ms
2. Reload within 30s (cache hit) → ~30-80ms
3. Create new quotation → next reload sees the new row (write invalidated cache)
4. Watch `console.warn("[cache]")` — should be empty in happy path
5. Disable Redis env (rename UPSTASH_* → broken) → app still works, just slower

Production monitoring (Phase 3):
- Sheets API call count from Google Cloud Console (should drop ~80%)
- Upstash dashboard — commands/day, latency p95
- Sentry — any `[cache]` warnings

---

## Out of scope (explicitly not done in S25A)

- Pre-warming cache on org login
- LRU eviction or memory budget tuning (Upstash handles)
- Cross-org cache sharing (incompatible with sovereignty principle)
- Pub/Sub-based active invalidation (TTL is sufficient for MVP)
- Caching `getById/getFiltered` separately (they use cached `getAll` internally — no extra benefit)

---

## References

- SYSTEM_REQUIREMENTS.md §3 — Reports = read-only aggregation
- session25/handoff/HANDOFF_2026-05-03_END_S24-PERF.md §"Phase 1 — Cache layer"
- Upstash docs: https://upstash.com/docs/redis/sdks/ts/getstarted
- Sheets API quota dashboard: https://console.cloud.google.com/apis/api/sheets.googleapis.com/quotas
