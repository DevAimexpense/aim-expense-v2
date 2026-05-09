# Privacy Policy — Aim Expense

**Data Controller:** Arto Co., Ltd. ("Aim Expense", "we")
**DPO contact:** dpo@aimexpense.com
**Effective:** 2026-XX-XX (before soft launch)
**Last updated:** 2026-05-09

---

> **Draft pending legal review.** This document has not been reviewed by counsel.
> A Thai-licensed lawyer review (~15-20K THB / ~1 week) is required before going live.

---

## 1. Scope

This Policy describes how Aim Expense collects, uses, discloses, and protects
personal data under the Thai Personal Data Protection Act B.E. 2562 (PDPA),
for users of our web application and LINE Official Account.

## 2. Core principle — Data Sovereignty

**Your business data (expenses, receipts, customers, quotations, invoices) is
stored in the Google Drive and Google Sheets of the Google account you connect
— not on our servers.** You may access, download, or delete it at any time
directly through Google Drive (no need to use Aim Expense to do so).

We only retain **infrastructure metadata** as detailed in §3.

## 3. Personal data we collect

### 3.1 User account
- Email and name from Google Sign-In or LINE Login
- LINE User ID, LINE display name, LINE profile picture (LINE-login users)
- Google OAuth tokens (encrypted at rest with AES-256)
- Phone number (optional, profile)

### 3.2 Organization
- Company / organisation name
- Address (optional)
- Tax ID (optional, in org settings)
- Google Spreadsheet ID + Drive Folder ID (references to files in your Google account)

### 3.3 Subscription
- Plan tier (free / basic / pro / business / max / enterprise)
- Billing history (via Stripe — see §6)

### 3.4 Audit log
- System actions (create / update / delete / approve) with **only ID references
  and short summaries** — **no amounts, vendor names, or receipt content**.

### 3.5 Technical logs
- IP address, browser user-agent, request timestamps (Vercel logs, retained ≤30 days)
- Sheets row cache in Upstash Redis (TTL 30 seconds — may include transient PII
  for customers/vendors)

### 3.6 What we do NOT store
- Receipt content, tax invoices, ID-card copies, customer/vendor addresses — these
  live in your Google Sheets/Drive only.
- OCR or AI analysis output — returned to your browser immediately, never persisted in our DB.
- Passwords — we use OAuth (Google / LINE) only; no password store exists.

## 4. Data sources

| Source | Data |
|--------|------|
| User input | Profile, company, customer/vendor records |
| Google OAuth | Email, name, OAuth tokens |
| LINE Login | LINE User ID, name, profile picture |
| LINE Messaging API | Messages and receipt images you send to our LINE OA |
| System-generated | IDs, timestamps, audit logs |

## 5. Purposes and lawful bases

| Purpose | Lawful basis |
|---------|--------------|
| Provide contracted service | Contract (PDPA §24(3)) |
| Audit log for security | Legitimate interest (§24(5)) |
| LINE OA notifications | Consent (§24(1)) |
| Issue tax invoices / VAT reports | Legal obligation (§24(6)) |
| Receipt OCR (assists data entry) | Contract + consent (toggle-able) |
| Subscription billing | Contract |

## 6. Sub-processors

See full list and data locations in [SUB_PROCESSORS.md](SUB_PROCESSORS.md). In brief:

- **Google (USA)** — Sheets, Drive, OAuth
- **Supabase (Singapore)** — Postgres for user/org/subscription metadata
- **Vercel (USA / SG edge)** — hosting + serverless
- **LINE (Japan)** — Login + Messaging API
- **Upstash (Singapore)** — Redis cache (TTL 30s)
- **AksonOCR (Thailand)** — Thai-OCR primary
- **OpenAI (USA)** — GPT-4o OCR fallback (toggle-able)
- **Stripe (USA, future)** — subscription billing

## 7. Cross-border transfers

Data is processed in **Singapore (Vercel + Supabase + Upstash), USA (Google + OpenAI),
Japan (LINE), Thailand (AksonOCR)**. Cross-border transfers rely on safeguards under
PDPA §28 (each sub-processor's Standard Contractual Clauses).

## 8. Retention

| Data | Period |
|------|--------|
| User profile + Org metadata | Until you delete your account |
| OAuth tokens | Until you revoke them |
| Subscription + invoices | 7 years (Thai Accounting Act) |
| Audit log | 1 year |
| Vercel access logs | 30 days |
| Redis cache | 30 seconds (TTL) |
| Data in your Google Sheets/Drive | You control it directly, indefinitely |

## 9. Your rights (Data Subject Rights)

Under PDPA §§30-37 you may:

- **Access / request a copy** of your personal data
- **Correct** inaccurate data
- **Delete** your data / **delete account**
- **Restrict** processing
- **Object** to processing (especially marketing)
- **Data portability**
- **Withdraw consent**
- **Complain** to the Personal Data Protection Committee (PDPC)

Exercise rights at: **/account/data** in the app, or email **dpo@aimexpense.com**
(we respond within 30 days as required by PDPA).

## 10. Security measures

- HTTPS/TLS 1.2+ for all connections
- OAuth tokens AES-256 encrypted at rest in Postgres
- OAuth-only sign-in (Google / LINE) — no passwords stored
- Role-based access control + per-user permission keys
- Audit log on every mutation
- Singapore-region servers (Supabase + Upstash) — low latency, regional safe harbour

## 11. Breach notification

We will notify the PDPC within **72 hours** of becoming aware of a breach that
risks the rights of data subjects. If risk is high we will also notify affected
data subjects directly per PDPA §37(4). See [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).

## 12. Cookies and tracking

- **Session cookies** — required for login
- **Vercel Analytics** — usage statistics (no PII, no cross-site tracking)
- **Sentry** — error tracking (no receipt content)
- **No** advertising or behavioural-tracking cookies

## 13. Policy changes

For material changes we provide 14 days' notice via email + in-app banner before
the new version takes effect.

## 14. Contact

- **DPO:** dpo@aimexpense.com
- **General support:** support@aimexpense.com
- **Address:** [TODO: Arto Co., Ltd. registered address]
- **Phone:** [TODO]
