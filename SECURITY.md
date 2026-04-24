# Security Policy — Aim Expense

## 🔒 Security Commitments

We take security seriously. This document outlines our security posture and commitments toward industry-standard certifications (SOC 2, ISO 27001, Thailand PDPA).

## Current Security Measures

### Authentication & Authorization
- **LINE Login (OIDC)** + **Google OAuth 2.0** — no passwords stored
- **JWT via httpOnly cookies** (HS256 signed with `jose`)
- **CSRF protection** via OAuth state cookie (10-min TTL)
- **Session expiration**: 7 days
- **Role-Based Access Control (RBAC)** — 4 roles (admin/manager/accountant/staff)
- **Attribute-Based Access Control (ABAC)** — 13 granular permissions per user
- **Admin override** — admins bypass permission checks (audited)

### Data Protection
- **OAuth tokens encrypted at rest** — AES-256-GCM in database
- **Business data stored in user's own Google Drive/Sheets** — NOT in our servers
- **Server database** (Supabase PostgreSQL) only holds:
  - User accounts + OAuth encrypted tokens
  - Organization metadata
  - Subscription + permissions
  - Audit log (no PII of end customers)
- **Transit**: TLS 1.2+ enforced (HSTS in production)
- **At rest**: Supabase encryption by default (AES-256)

### Input Validation & Injection Prevention
- **Zod schemas** validate all tRPC inputs
- **Prisma ORM** — parameterized queries (SQL injection protection)
- **React auto-escape** — XSS prevention
- **File uploads** — MIME whitelist + **magic bytes verification** (prevents disguised files)
- **File size limits** — 10 MB per upload

### Network Security (HTTP Headers)
- **Content-Security-Policy (CSP)** — restricts allowed origins
- **Strict-Transport-Security (HSTS)** — production only, 1 year
- **X-Frame-Options: SAMEORIGIN** — prevents clickjacking
- **X-Content-Type-Options: nosniff** — prevents MIME sniffing
- **Referrer-Policy: strict-origin-when-cross-origin**
- **Permissions-Policy** — restricts browser features (camera, mic, geo, payments)

### Rate Limiting
- `/api/ocr/receipt` — 20 requests/minute
- `/api/payments/upload` — 30 requests/minute
- `/api/auth/line`, `/api/auth/google` — 10 attempts/minute (brute force protection)
- `/api/webhook/line` — 300/minute (LINE can burst)

### Webhook Security
- **LINE webhook signature verification** — HMAC-SHA256 via Channel Secret
- **Timing-safe comparison** to prevent timing attacks

### Secret Management
- Secrets in `.env.local` (gitignored)
- **Environment variable whitelist** in production
- **Secret rotation supported** — no hardcoded credentials

### Third-Party APIs
- **OpenAI API** — key never sent to client, all OCR server-side
- **Google APIs** — user authorizes their own data access (least privilege: `drive.file` scope, not full Drive)
- **LINE APIs** — channel secrets server-side only

### Audit Logging
- All sensitive operations logged to `audit_log` table:
  - User login / logout
  - Permission changes
  - Payment create/update/approve/reject/pay
  - Document generation (WTH cert, substitute receipt)
  - File uploads
- Logs include: user ID, action, entity, timestamp, IP

## Incident Response

If you discover a security vulnerability:
1. **DO NOT** open a public GitHub issue
2. Email: `security@aimexpense.com`
3. Include: description, reproduction steps, impact assessment
4. We will acknowledge within 48 hours and provide a timeline for fix

## Planned Enhancements

- [ ] **2FA** — TOTP / SMS (post-launch)
- [ ] **IP-based anomaly detection** — login from new location
- [ ] **Web Application Firewall (WAF)** — Cloudflare / Vercel Edge
- [ ] **Data retention policy** — automated archival after 7 years (tax law)
- [ ] **Right to erasure (PDPA)** — self-service data deletion
- [ ] **Penetration testing** — annual external audit
- [ ] **SOC 2 Type II** certification
- [ ] **ISO 27001** certification
- [ ] **Google CASA assessment** — for `gmail.readonly` scope (if needed)

## Supported Versions

Only the latest version receives security updates.

## Privacy & PDPA Compliance

See `/legal/privacy-policy` for our privacy practices.
