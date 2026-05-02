// ===========================================
// Settings → Google Connection (admin only)
//
// Shows the linked Google account, the org's Master Spreadsheet, and the
// Drive folder layout, with a single "Reconnect" action that re-runs the
// OAuth flow. The callback at /api/auth/google/callback knows to come back
// here when the user is already past onboarding.
// ===========================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getOrgContext } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "เชื่อมต่อ Google | Aim Expense",
};

const GMAIL_SCOPE_PREFIX = "https://www.googleapis.com/auth/gmail";
const SHEETS_SCOPE_PREFIX = "https://www.googleapis.com/auth/spreadsheets";
const DRIVE_SCOPE_PREFIX = "https://www.googleapis.com/auth/drive";
const USERINFO_SCOPE_PREFIX = "https://www.googleapis.com/auth/userinfo";

function hasScope(scopes: string[], prefix: string): boolean {
  return scopes.some((s) => s.startsWith(prefix));
}

function formatThaiDate(date: Date | null | undefined): string {
  if (!date) return "—";
  try {
    return date.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatExpiryRelative(expiry: Date | null): {
  label: string;
  tone: "ok" | "warn" | "expired";
} {
  if (!expiry) return { label: "ไม่มีข้อมูล", tone: "warn" };
  const ms = expiry.getTime() - Date.now();
  if (ms <= 0) return { label: "หมดอายุแล้ว — กดเชื่อมต่อใหม่", tone: "expired" };
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return {
      label: `หมดอายุในอีก ${minutes} นาที`,
      tone: minutes < 10 ? "warn" : "ok",
    };
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { label: `หมดอายุในอีก ${hours} ชั่วโมง`, tone: "ok" };
  }
  const days = Math.floor(hours / 24);
  return { label: `หมดอายุในอีก ${days} วัน`, tone: "ok" };
}

export default async function GoogleSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ reconnected?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.onboardingStep !== "done") redirect("/");

  const orgCtx = await getOrgContext(session.userId);
  if (!orgCtx) redirect("/");

  // adminOnly per sidebar config — manager/accountant/staff shouldn't reconnect
  if (orgCtx.role !== "admin") redirect("/dashboard");

  // Pull the bits we need directly from Prisma (one round trip — page is small)
  const [connection, org] = await Promise.all([
    prisma.googleConnection.findUnique({
      where: { userId: session.userId },
      select: {
        googleEmail: true,
        scopes: true,
        tokenExpiry: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.organization.findUnique({
      where: { id: orgCtx.orgId },
      select: {
        googleSpreadsheetId: true,
        googleDriveFolderId: true,
        driveReceiptsFolderId: true,
        driveDocumentsFolderId: true,
        driveReportsFolderId: true,
      },
    }),
  ]);

  const params = await searchParams;
  const justReconnected = params.reconnected === "1";

  const expiry = connection?.tokenExpiry
    ? formatExpiryRelative(connection.tokenExpiry)
    : null;

  const scopes = connection?.scopes ?? [];
  const scopeFlags = {
    sheets: hasScope(scopes, SHEETS_SCOPE_PREFIX),
    drive: hasScope(scopes, DRIVE_SCOPE_PREFIX),
    gmail: hasScope(scopes, GMAIL_SCOPE_PREFIX),
    profile: hasScope(scopes, USERINFO_SCOPE_PREFIX),
  };

  const sheetUrl = org?.googleSpreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${org.googleSpreadsheetId}`
    : null;
  const driveUrl = org?.googleDriveFolderId
    ? `https://drive.google.com/drive/folders/${org.googleDriveFolderId}`
    : null;
  const receiptsUrl = org?.driveReceiptsFolderId
    ? `https://drive.google.com/drive/folders/${org.driveReceiptsFolderId}`
    : null;
  const documentsUrl = org?.driveDocumentsFolderId
    ? `https://drive.google.com/drive/folders/${org.driveDocumentsFolderId}`
    : null;
  const reportsUrl = org?.driveReportsFolderId
    ? `https://drive.google.com/drive/folders/${org.driveReportsFolderId}`
    : null;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🔗 เชื่อมต่อ Google</h1>
          <p className="app-page-subtitle">
            {orgCtx.orgName} • Google Account ที่ใช้เก็บข้อมูลธุรกิจของคุณ
          </p>
        </div>
      </div>

      {justReconnected && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: "0.5rem",
            marginBottom: "1rem",
            color: "#065f46",
            fontSize: "0.875rem",
          }}
        >
          ✅ <strong>เชื่อมต่อใหม่สำเร็จ</strong> — token ถูกอัปเดตเรียบร้อยแล้ว
        </div>
      )}

      {/* ===== Card 1: Account ===== */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "0.75rem",
          padding: "1.25rem 1.25rem 1rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.875rem",
          }}
        >
          <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
            Google Account ที่เชื่อมต่ออยู่
          </h2>
          {connection?.isActive ? (
            <span className="app-badge app-badge-success">เชื่อมต่ออยู่</span>
          ) : (
            <span className="app-badge app-badge-error">ตัดการเชื่อมต่อ</span>
          )}
        </div>

        {connection ? (
          <>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "0.5rem 1rem",
                margin: 0,
                fontSize: "0.875rem",
              }}
            >
              <dt style={{ color: "#64748b" }}>อีเมล</dt>
              <dd style={{ margin: 0, fontWeight: 500 }}>
                {connection.googleEmail}
              </dd>

              <dt style={{ color: "#64748b" }}>เชื่อมต่อเมื่อ</dt>
              <dd style={{ margin: 0 }}>
                {formatThaiDate(connection.createdAt)}
              </dd>

              <dt style={{ color: "#64748b" }}>อัปเดตล่าสุด</dt>
              <dd style={{ margin: 0 }}>
                {formatThaiDate(connection.updatedAt)}
              </dd>

              <dt style={{ color: "#64748b" }}>Token</dt>
              <dd
                style={{
                  margin: 0,
                  color:
                    expiry?.tone === "expired"
                      ? "#dc2626"
                      : expiry?.tone === "warn"
                      ? "#d97706"
                      : "#16a34a",
                  fontWeight: 500,
                }}
              >
                {expiry?.label ?? "—"}
              </dd>
            </dl>

            <div
              style={{
                marginTop: "1rem",
                paddingTop: "1rem",
                borderTop: "1px dashed #e2e8f0",
              }}
            >
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "#64748b",
                  marginBottom: "0.5rem",
                }}
              >
                สิทธิ์ที่ได้รับจาก Google:
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  fontSize: "0.8125rem",
                }}
              >
                <ScopeChip on={scopeFlags.sheets} label="Google Sheets" />
                <ScopeChip on={scopeFlags.drive} label="Google Drive" />
                <ScopeChip on={scopeFlags.gmail} label="Gmail (อ่านอย่างเดียว)" />
                <ScopeChip on={scopeFlags.profile} label="ข้อมูลโปรไฟล์" />
              </ul>
            </div>
          </>
        ) : (
          <p
            style={{
              fontSize: "0.875rem",
              color: "#dc2626",
              margin: "0.5rem 0 0",
            }}
          >
            ⚠️ ยังไม่มีการเชื่อมต่อ Google Account สำหรับ user นี้ —
            กดปุ่มด้านล่างเพื่อเชื่อมต่อ
          </p>
        )}

        <div
          style={{
            marginTop: "1.25rem",
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <a href="/api/auth/google" className="app-btn app-btn-primary">
            🔄 {connection ? "เชื่อมต่อใหม่" : "เชื่อมต่อ Google"}
          </a>
          <span
            style={{
              fontSize: "0.75rem",
              color: "#94a3b8",
              alignSelf: "center",
            }}
          >
            ใช้สำหรับต่ออายุ token หรือเปลี่ยนบัญชี Google
          </span>
        </div>
      </section>

      {/* ===== Card 2: Master Spreadsheet ===== */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          marginBottom: "1rem",
        }}
      >
        <h2
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 0.75rem",
          }}
        >
          📊 Master Spreadsheet
        </h2>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "#64748b",
            margin: "0 0 0.75rem",
          }}
        >
          Sheet ที่เก็บข้อมูลธุรกิจทั้งหมด (Events, Payees, Banks, Payments,
          ฯลฯ) — อยู่ใน Google Drive ของคุณ
        </p>
        {sheetUrl ? (
          <ExternalLink href={sheetUrl} icon="📊" label="เปิด Master Spreadsheet" />
        ) : (
          <p style={{ fontSize: "0.875rem", color: "#dc2626", margin: 0 }}>
            ⚠️ ยังไม่ได้สร้าง Master Spreadsheet
          </p>
        )}
      </section>

      {/* ===== Card 3: Drive folders ===== */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "0.75rem",
          padding: "1.25rem",
        }}
      >
        <h2
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 0.75rem",
          }}
        >
          📁 โฟลเดอร์ Google Drive
        </h2>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "#64748b",
            margin: "0 0 0.875rem",
          }}
        >
          ที่จัดเก็บไฟล์ใบเสร็จ ใบกำกับภาษี และ PDF เอกสารต่างๆ
        </p>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <DriveFolderRow
            href={driveUrl}
            icon="📁"
            label="โฟลเดอร์หลัก"
            sub="ที่เก็บโฟลเดอร์ย่อยทั้งหมด"
          />
          <DriveFolderRow
            href={receiptsUrl}
            icon="🧾"
            label="ใบเสร็จ / ใบกำกับภาษี"
            sub="ไฟล์ใบเสร็จที่ user อัปโหลด"
          />
          <DriveFolderRow
            href={documentsUrl}
            icon="📄"
            label="เอกสารระบบ"
            sub="ใบรับรองหัก ณ ที่จ่าย / ใบสำคัญรับเงิน ฯลฯ"
          />
          <DriveFolderRow
            href={reportsUrl}
            icon="📑"
            label="รายงาน"
            sub="PDF รายงานรายเดือน / รายปี"
          />
        </div>
      </section>

      {/* ===== Footer note ===== */}
      <div
        style={{
          marginTop: "1.25rem",
          padding: "0.875rem 1rem",
          background: "#f1f5f9",
          border: "1px solid #e2e8f0",
          borderRadius: "0.5rem",
          fontSize: "0.8125rem",
          color: "#475569",
          lineHeight: 1.6,
        }}
      >
        ℹ️ <strong>ข้อมูลธุรกิจของคุณเป็นของคุณ</strong> —
        Aim Expense ไม่ได้เก็บข้อมูลใดๆ ของคุณบนเซิร์ฟเวอร์ของเรา
        ทุกอย่างอยู่ใน Google Drive ของคุณเอง
        คุณสามารถยกเลิกสิทธิ์ของแอปได้ทุกเมื่อจาก{" "}
        <Link
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563eb", textDecoration: "underline" }}
        >
          Google Account Permissions
        </Link>
        .
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Sub-components (kept inline — page-local, no reuse)
// -------------------------------------------------------------------

function ScopeChip({ on, label }: { on: boolean; label: string }) {
  return (
    <li
      style={{
        padding: "0.25rem 0.625rem",
        borderRadius: "999px",
        background: on ? "#ecfdf5" : "#fef2f2",
        color: on ? "#065f46" : "#991b1b",
        border: `1px solid ${on ? "#a7f3d0" : "#fecaca"}`,
        fontSize: "0.75rem",
        fontWeight: 500,
      }}
    >
      {on ? "✓" : "✗"} {label}
    </li>
  );
}

function ExternalLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="app-btn app-btn-ghost app-btn-sm"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        textDecoration: "none",
        background: "#fff",
        border: "1px solid #cbd5e1",
        color: "#1e293b",
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
      <span style={{ color: "#94a3b8" }}>↗</span>
    </a>
  );
}

function DriveFolderRow({
  href,
  icon,
  label,
  sub,
}: {
  href: string | null;
  icon: string;
  label: string;
  sub: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.625rem 0.875rem",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "0.5rem",
      }}
    >
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "center" }}>
        <span style={{ fontSize: "1.125rem" }}>{icon}</span>
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{sub}</div>
        </div>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "0.8125rem",
            color: "#2563eb",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          เปิด ↗
        </a>
      ) : (
        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
          ยังไม่ได้สร้าง
        </span>
      )}
    </div>
  );
}
