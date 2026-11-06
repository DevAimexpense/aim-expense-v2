"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { formatDate, formatDateTime, formatMonthYear } from "@/lib/utils/date";
import { PLAN_LABELS, PLAN_LIMITS } from "@/lib/plans";
import {
  Badge,
  MEMBER_STATUS_LABELS,
  ROLE_LABELS,
  StatusBadges,
  expiryText,
  intervalLabel,
  limitText,
} from "../../shared";
import { GrantModal } from "../grant-modal";

const ONBOARDING_LABELS: Record<string, string> = {
  line_login: "เข้าสู่ระบบ LINE",
  line_oa: "เพิ่มเพื่อน LINE OA",
  google: "เชื่อม Google",
  company: "ตั้งบริษัท",
  done: "เสร็จสมบูรณ์",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "0.75rem", padding: "0.375rem 0", fontSize: "0.875rem" }}>
      <div style={{ width: "9rem", flexShrink: 0, color: "#64748b" }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="app-card" style={{ marginBottom: "1rem" }}>
      <div className="app-card-header">
        <div>
          <h2 className="app-card-title">{title}</h2>
          {subtitle && <p className="app-card-subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function OrgDetailClient({ orgId }: { orgId: string }) {
  const utils = trpc.useUtils();
  const q = trpc.backoffice.orgDetail.useQuery({ orgId });
  const revokeMut = trpc.backoffice.revoke.useMutation();
  const [grantOpen, setGrantOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    utils.backoffice.orgDetail.invalidate({ orgId });
    utils.backoffice.accounts.invalidate();
    utils.backoffice.overview.invalidate();
  };

  if (q.isLoading) {
    return <div style={{ padding: "2rem", color: "#64748b" }}>กำลังโหลด…</div>;
  }
  if (q.error || !q.data) {
    return (
      <>
        <div className="app-error-msg">{q.error?.message ?? "โหลดไม่สำเร็จ"}</div>
        <Link href="/backoffice/customers" className="app-btn app-btn-ghost app-btn-sm">
          ← กลับรายชื่อลูกค้า
        </Link>
      </>
    );
  }

  const d = q.data;
  const ex = expiryText(d);
  const sub = d.subscription;
  const limits = PLAN_LIMITS[d.plan];
  const google = d.owner.google;
  const googleProblem = !google || !google.isActive;
  const currentOcr = d.ocr.months[0];

  const handleRevoke = async () => {
    if (
      !window.confirm(
        d.inTrial
          ? `ยกเลิกสิทธิ์ใช้ฟรีชั่วคราวของ "${d.orgName}" ทันที?`
          : d.lifetime
            ? `ยกเลิกสิทธิ์ฟรีตลอดชีพของ "${d.orgName}" ทันที?`
            : `ยกเลิกวางบิล/โอนของ "${d.orgName}" → ลดเป็นแผนฟรีทันที ไม่รอสิ้นรอบที่จ่ายไว้?`,
      )
    )
      return;
    setError(null);
    setNotice(null);
    try {
      await revokeMut.mutateAsync({ orgId });
      setNotice("ยกเลิกสิทธิ์แล้ว");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <>
      <div className="app-page-header">
        <div>
          <Link href="/backoffice/customers" style={{ fontSize: "0.8125rem", color: "#64748b" }}>
            ← ลูกค้าทั้งหมด
          </Link>
          <h1 className="app-page-title" style={{ marginTop: "0.25rem" }}>
            {d.orgName}
          </h1>
          <p className="app-page-subtitle">
            {d.entityType === "personal" ? "บุคคลธรรมดา" : "นิติบุคคล"} · สมัครเมื่อ{" "}
            {formatDate(d.createdAt)} · {d.planLabel}
          </p>
          <div style={{ marginTop: "0.5rem" }}>
            <StatusBadges r={d} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="app-btn app-btn-secondary"
            onClick={() => {
              setNotice(null);
              setError(null);
              setGrantOpen(true);
            }}
          >
            กำหนดแพ็กเกจ
          </button>
          {(d.lifetime || d.inTrial || d.invoice) && (
            <button
              type="button"
              className="app-btn app-btn-ghost"
              style={{ color: "#dc2626" }}
              disabled={revokeMut.isPending}
              onClick={handleRevoke}
            >
              ยกเลิกสิทธิ์
            </button>
          )}
        </div>
      </div>

      {error && <div className="app-error-msg">{error}</div>}
      {notice && (
        <div
          style={{
            background: "#dcfce7",
            border: "1px solid #86efac",
            color: "#166534",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          ✓ {notice}
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
        {/* ===== แพ็กเกจ ===== */}
        <Section title="💳 แพ็กเกจและการชำระเงิน">
          <Row label="ใช้ได้จริงตอนนี้">
            <strong>{d.planLabel}</strong>
            {d.basePlan !== d.plan && (
              <span style={{ color: "#64748b" }}> (แพ็กเกจฐาน {PLAN_LABELS[d.basePlan]})</span>
            )}
          </Row>
          <Row label="หมดอายุ">
            <span style={{ fontWeight: ex.warn ? 600 : 400, color: ex.warn ? "#b45309" : undefined }}>
              {ex.text}
            </span>
            {ex.sub && <span style={{ color: "#64748b" }}> · {ex.sub}</span>}
          </Row>
          {d.inTrial && sub?.trialStartedAt && (
            <Row label="ช่วงฟรี">
              {PLAN_LABELS[d.plan]} ตั้งแต่ {formatDate(sub.trialStartedAt)} ถึง{" "}
              {formatDate(sub.trialEndsAt)}
            </Row>
          )}
          {d.invoice && sub && (
            <Row label="วางบิล / โอน">
              {intervalLabel(sub.billingInterval, true)} · รอบ {formatDate(sub.billingPeriodStart)} –{" "}
              {formatDate(sub.billingPeriodEnd)}
              {!d.invoiceActive && <span style={{ color: "#dc2626" }}> · หมดรอบแล้ว</span>}
            </Row>
          )}
          <Row label="Stripe">
            {d.hasStripe && sub ? (
              <>
                <div>
                  สถานะ <code>{sub.status}</code> · {intervalLabel(sub.billingInterval)}
                  {sub.cancelAtPeriodEnd && (
                    <span style={{ color: "#dc2626" }}> · ยกเลิกสิ้นรอบ</span>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", wordBreak: "break-all" }}>
                  {sub.stripeCustomerId && (
                    <a
                      href={`https://dashboard.stripe.com/customers/${sub.stripeCustomerId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {sub.stripeCustomerId}
                    </a>
                  )}
                  {sub.stripeSubscriptionId && ` · ${sub.stripeSubscriptionId}`}
                </div>
              </>
            ) : (
              <span style={{ color: "#64748b" }}>ไม่มี (ไม่เคยผูกบัตร)</span>
            )}
          </Row>
          <Row label="โควตาแพ็กเกจ">
            {limitText(limits.users, "ผู้ใช้")} · {limitText(limits.events, "โปรเจกต์")} · OCR{" "}
            {limitText(limits.ocrPerMonth, "ครั้ง/เดือน")}
          </Row>
          {sub && (
            <Row label="cache บนแถว">
              <span style={{ color: "#64748b", fontSize: "0.8125rem" }}>
                maxMembers {sub.maxMembers} · maxEvents {sub.maxEvents} · scanCredits {sub.scanCredits} ·
                อัปเดต {formatDateTime(sub.updatedAt)}
              </span>
            </Row>
          )}
          {!sub && (
            <p className="app-hint">ยังไม่มีแถว Subscription — ถือเป็นแผนฟรี</p>
          )}
        </Section>

        {/* ===== OCR ===== */}
        <Section
          title="🔎 เครดิต OCR"
          subtitle={`เดือนนี้ใช้ ${currentOcr?.count ?? 0}${d.ocr.limit === -1 ? " (ไม่จำกัด)" : ` / ${d.ocr.limit}`} ครั้ง`}
        >
          <table className="app-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>เดือน</th>
                <th className="num">ใช้ไป</th>
                <th className="num">เพดาน</th>
              </tr>
            </thead>
            <tbody>
              {d.ocr.months.map((m, i) => {
                const over = d.ocr.limit !== -1 && m.count >= d.ocr.limit;
                return (
                  <tr key={m.yearMonth}>
                    <td>
                      {formatMonthYear(`${m.yearMonth}-01`)}
                      {i === 0 && <span style={{ color: "#64748b" }}> (เดือนนี้)</span>}
                    </td>
                    <td className="num" style={{ color: over && i === 0 ? "#dc2626" : undefined }}>
                      {m.count}
                    </td>
                    <td className="num" style={{ color: "#94a3b8" }}>
                      {i === 0 ? (d.ocr.limit === -1 ? "∞" : d.ocr.limit) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="app-hint">
            เพดานแสดงเฉพาะเดือนนี้ตามแพ็กเกจปัจจุบัน — เดือนก่อนอาจอยู่คนละแพ็กเกจ
          </p>
        </Section>

        {/* ===== บริษัทและเจ้าของ ===== */}
        <Section title="🏢 บริษัทและเจ้าของ">
          <Row label="เลขผู้เสียภาษี">{d.org.taxId || "—"}</Row>
          <Row label="สาขา">
            {d.org.branchType === "HQ" ? "สำนักงานใหญ่" : `สาขา ${d.org.branchNumber}`}
          </Row>
          <Row label="โทร">{d.org.phone || "—"}</Row>
          <Row label="เจ้าของ">
            <div>{d.owner.name}</div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
              {d.owner.email || "ไม่มีอีเมล"} · LINE: {d.owner.lineDisplayName}
            </div>
          </Row>
          <Row label="Onboarding">
            {ONBOARDING_LABELS[d.owner.onboardingStep] ?? d.owner.onboardingStep}
            {d.owner.onboardingStep !== "done" && (
              <span style={{ color: "#b45309" }}> · ยังไม่เสร็จ</span>
            )}
          </Row>
          <Row label="ชีต / Drive">
            {d.org.hasSpreadsheet ? "มีชีตแล้ว" : <span style={{ color: "#b45309" }}>ยังไม่มีชีต</span>}
            {" · "}
            {d.org.hasDriveFolder ? "มีโฟลเดอร์แล้ว" : <span style={{ color: "#b45309" }}>ยังไม่มีโฟลเดอร์</span>}
          </Row>
          <Row label="กลุ่ม LINE">{d.org.lineGroupCount} กลุ่ม</Row>
        </Section>

        {/* ===== Google ===== */}
        <Section title="🔗 การเชื่อม Google (ของเจ้าของ)">
          {google ? (
            <>
              <Row label="บัญชี Google">{google.email}</Row>
              <Row label="สถานะ">
                {google.isActive ? (
                  <Badge bg="#dcfce7" color="#166534">เชื่อมอยู่</Badge>
                ) : (
                  <Badge bg="#fee2e2" color="#991b1b">ถูกยกเลิก — ต้องเชื่อมใหม่</Badge>
                )}
              </Row>
              <Row label="token หมดอายุ">
                {google.tokenExpiry ? formatDateTime(google.tokenExpiry) : "—"}
                <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                  {" "}(ต่ออายุอัตโนมัติเมื่อใช้งาน)
                </span>
              </Row>
              <Row label="อัปเดตล่าสุด">{formatDateTime(google.updatedAt)}</Row>
            </>
          ) : (
            <p style={{ color: "#b45309", fontSize: "0.875rem" }}>
              เจ้าของยังไม่เคยเชื่อม Google — ระบบบันทึกข้อมูลไม่ได้
            </p>
          )}
          {googleProblem && (
            <p className="app-hint">
              ถ้าลูกค้าแจ้งว่าบันทึกไม่ได้ / LINE ตอบว่าต้องเชื่อมใหม่ ให้เจ้าของไปที่ ตั้งค่า → Google แล้วเชื่อมด้วยบัญชี{" "}
              {google?.email ?? "ที่เป็นเจ้าของชีต"}
            </p>
          )}
        </Section>
      </div>

      {/* ===== สมาชิก ===== */}
      <Section
        title={`👥 สมาชิก (${d.memberCount} ใช้งาน / เพดาน ${d.memberCap === -1 ? "ไม่จำกัด" : d.memberCap})`}
        subtitle={d.org.pendingInvitations > 0 ? `คำเชิญที่ยังไม่ตอบรับ ${d.org.pendingInvitations} รายการ` : undefined}
      >
        <div style={{ overflowX: "auto" }}>
          <table className="app-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>อีเมล</th>
                <th>บทบาท</th>
                <th>สถานะ</th>
                <th>เข้าร่วม</th>
              </tr>
            </thead>
            <tbody>
              {d.members.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name}
                    {m.isOwner && <span style={{ color: "#64748b" }}> (เจ้าของ)</span>}
                  </td>
                  <td style={{ color: "#64748b" }}>{m.email || "—"}</td>
                  <td>{ROLE_LABELS[m.role] ?? m.role}</td>
                  <td>
                    {m.status === "active" ? (
                      <Badge bg="#dcfce7" color="#166534">{MEMBER_STATUS_LABELS.active}</Badge>
                    ) : (
                      <Badge bg="#f1f5f9" color="#475569">{MEMBER_STATUS_LABELS[m.status] ?? m.status}</Badge>
                    )}
                  </td>
                  <td>{formatDate(m.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ===== ประวัติ ===== */}
      <Section
        title="📜 ประวัติสิทธิ์และการตั้งค่า"
        subtitle="เฉพาะเรื่องแพ็กเกจ/สิทธิ์/สมาชิก/ตั้งค่า — ไม่แสดงรายการค้าของลูกค้า (Zero Data Retention)"
      >
        {d.auditLogs.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>ยังไม่มีประวัติ</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="app-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>เมื่อ</th>
                  <th>เรื่อง</th>
                  <th>โดย</th>
                </tr>
              </thead>
              <tbody>
                {d.auditLogs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(l.createdAt)}</td>
                    <td>
                      <div>{l.summary || `${l.action} ${l.entityType}`}</div>
                      <div style={{ fontSize: "0.6875rem", color: "#94a3b8" }}>
                        {l.entityType} · {l.action}
                      </div>
                    </td>
                    <td style={{ color: "#64748b" }}>{l.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {grantOpen && (
        <GrantModal
          target={d}
          onClose={() => setGrantOpen(false)}
          onDone={(msg) => {
            setGrantOpen(false);
            setNotice(msg);
            refresh();
          }}
        />
      )}
    </>
  );
}
