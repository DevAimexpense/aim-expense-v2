# Terms of Service — Aim Expense

**Provider:** Arto Co., Ltd. ("Aim Expense", "we")
**Effective:** 2026-XX-XX
**Last updated:** 2026-05-09

---

> **Draft pending legal review.** Send to counsel before going live.

---

## 1. Acceptance

By signing up for Aim Expense (web app + LINE OA) you accept these Terms and the
[Privacy Policy](PRIVACY_POLICY_EN.md). If you do not agree, please do not use the service.

## 2. Definitions

- **"Service"** — the Aim Expense web app, LINE OA, and any exposed API
- **"Organisation"** — an org account you create
- **"Business data"** — receipts, invoices, expense records, customers, vendors,
  etc., stored in your Google Drive/Sheets
- **"Plan"** — free / basic / pro / business / max / enterprise tiers

## 3. Sign-up & accounts

- You must be 18+ or have legal-guardian consent
- You must provide accurate, up-to-date information
- You are responsible for the security of the Google / LINE account you use to log in
- Account sharing between distinct individuals is forbidden — use the in-app invite
  + permission system instead

## 4. Your business data (Data Sovereignty)

- **You own** your business data; it lives in your Google Drive/Sheets
- We access your data through Google OAuth only within scopes you grant
- You may delete your Aim Expense account at any time — your Google Sheets/Drive data is **not** affected
- We may cache rows briefly in Redis (TTL ≤ 60s) for performance — see Privacy Policy §3.5

## 5. Service scope

Aim Expense provides:
- Expense capture (with receipt OCR)
- Quotation / Billing / Tax-invoice generation
- Tax reports (PND.3, PND.53, PP.30)
- Team workflows (roles + permissions)
- LINE OA notifications

We do NOT:
- Provide tax or accounting advice — consult a CPA
- Guarantee OCR accuracy — review the output yourself
- Promise 100% uptime — see §11

## 6. Acceptable use

You may not use the Service to:
- Conduct illegal activities
- Send spam or offensive content
- Attempt to attack, reverse-engineer, or bypass billing
- Collect third-party personal data without consent

## 7. Plans & billing

- Pricing / quota per plan are listed at /pricing
- Monthly / annual billing via Stripe (rolling out)
- 7% VAT is included in displayed prices unless stated otherwise
- Cancel anytime — service continues to end of current billing cycle
- No refunds for already-used periods, except when we breach the Terms

## 8. Termination & account deletion

- Delete your account at /account/data
- Upon deletion:
  - Postgres data (user / org / subscription metadata) deleted within 30 days
  - Audit log purged after 1-year retention
  - **Your Google Sheets/Drive data is NOT touched** — you control it
- We may suspend or terminate your account for §6 violations — with prior notice when possible

## 9. Intellectual property

- Aim Expense software, brand, designs → ours
- Business data → yours
- Feedback you send us → we may use it freely (non-exclusive license)

## 10. Warranties & liability

- Service provided "AS IS" with no warranty, express or implied
- We are not liable for:
  - Indirect or consequential damages
  - Loss of data residing in your Google Drive (Google is the provider)
  - Adverse outcomes of tax/accounting decisions based on our reports
- Maximum aggregate liability is capped at **fees you paid us in the past 12 months**
- The above limits do not apply to: damages from wilful misconduct or gross negligence,
  liability that law forbids us to limit

## 11. SLA

- Target 99.5% monthly uptime (no credits below the Enterprise plan)
- Maintenance windows announced via email + in-app
- Status page: status.aimexpense.com (TODO)

## 12. Governing law & venue

- Thai law applies
- Disputes resolved in Bangkok courts

## 13. Changes

We may update these Terms — material changes are announced 14 days in advance via
email and an in-app banner.

## 14. Contact

- **Email:** support@aimexpense.com
- **DPO:** dpo@aimexpense.com
- **Address:** [TODO: Arto Co., Ltd.]
