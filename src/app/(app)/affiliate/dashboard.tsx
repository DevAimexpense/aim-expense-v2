"use client";

// ===========================================
// Affiliate partner dashboard — referral link, referrals, commissions
// (grouped by status), totals, and PromptPay payout account editing.
// ===========================================

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { formatDate as thaiDate } from "@/lib/utils/date";

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "0.75rem",
  padding: "1.25rem",
  marginBottom: "1rem",
};

function baht(n: number): string {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const REFERRAL_STATUS_TH: Record<string, { label: string; tone: string }> = {
  pending: { label: "รอยืนยัน", tone: "#d97706" },
  confirmed: { label: "ยืนยันแล้ว", tone: "#16a34a" },
  refunded: { label: "คืนเงิน", tone: "#dc2626" },
  invalid: { label: "ไม่ผ่าน", tone: "#dc2626" },
};

export function Dashboard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.affiliate.dashboard.useQuery();
  const updateMut = trpc.affiliate.updatePayout.useMutation({
    onSuccess: () => utils.affiliate.dashboard.invalidate(),
  });

  const [editing, setEditing] = useState(false);
  const [payout, setPayout] = useState("");
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return <p style={{ color: "#64748b" }}>กำลังโหลด...</p>;
  }
  if (!data) {
    return <p style={{ color: "#dc2626" }}>ไม่พบข้อมูลพันธมิตร</p>;
  }

  const { referralLink, referrals, commissions, totals, minPayoutTHB, partner } =
    data;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  };

  const savePayout = async () => {
    if (payout.trim().length < 4) return;
    await updateMut.mutateAsync({ payoutAccount: payout.trim() });
    setEditing(false);
  };

  return (
    <div>
      {/* Referral link */}
      <section style={card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
          🔗 ลิงก์แนะนำของคุณ
        </h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            readOnly
            value={referralLink}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              flex: 1,
              minWidth: "240px",
              padding: "0.625rem 0.75rem",
              border: "1px solid #cbd5e1",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              background: "#f8fafc",
            }}
          />
          <button onClick={copyLink} className="app-btn app-btn-primary">
            {copied ? "✓ คัดลอกแล้ว" : "คัดลอก"}
          </button>
        </div>
        <p style={{ fontSize: "0.8125rem", color: "#64748b", marginTop: "0.625rem" }}>
          โค้ดของคุณ: <strong>{partner.code}</strong> — แชร์ลิงก์นี้ให้เพื่อน
          เมื่อเขาสมัครแพ็กเกจแบบเสียเงิน คุณจะได้ค่าคอมมิชชั่น
        </p>
      </section>

      {/* Totals */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        {[
          { label: "รอจ่าย", value: baht(totals.pendingTHB), tone: "#d97706" },
          { label: "จ่ายแล้ว (สะสม)", value: baht(totals.lifetimeTHB), tone: "#16a34a" },
          { label: "คนที่แนะนำ", value: `${totals.referralCount} คน`, tone: "#0f172a" },
          { label: "ยืนยันแล้ว", value: `${totals.confirmedCount} คน`, tone: "#2563eb" },
        ].map((s) => (
          <div key={s.label} style={{ ...card, marginBottom: 0, padding: "1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{s.label}</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: s.tone }}>
              {s.value}
            </div>
          </div>
        ))}
      </section>
      <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "-0.5rem 0 1rem" }}>
        * จ่ายค่าคอมมิชชั่นเมื่อยอดสะสมถึง {baht(minPayoutTHB)}
      </p>

      {/* Payout account */}
      <section style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "0.8125rem", color: "#64748b" }}>
              บัญชี PromptPay รับเงิน
            </div>
            <div style={{ fontWeight: 600 }}>{partner.payoutAccount}</div>
          </div>
          {!editing && (
            <button
              onClick={() => {
                setPayout(partner.payoutAccount ?? "");
                setEditing(true);
              }}
              className="app-btn app-btn-ghost app-btn-sm"
            >
              แก้ไข
            </button>
          )}
        </div>
        {editing && (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <input
              value={payout}
              onChange={(e) => setPayout(e.target.value)}
              style={{
                flex: 1,
                padding: "0.5rem 0.75rem",
                border: "1px solid #cbd5e1",
                borderRadius: "0.5rem",
              }}
              maxLength={64}
            />
            <button
              onClick={savePayout}
              disabled={updateMut.isPending}
              className="app-btn app-btn-primary"
            >
              บันทึก
            </button>
            <button
              onClick={() => setEditing(false)}
              className="app-btn app-btn-ghost"
            >
              ยกเลิก
            </button>
          </div>
        )}
      </section>

      {/* Referrals */}
      <section style={card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
          👥 คนที่คุณแนะนำ ({referrals.length})
        </h2>
        {referrals.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "#94a3b8" }}>
            ยังไม่มีคนสมัครผ่านลิงก์ของคุณ — แชร์ลิงก์ด้านบนได้เลย
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {referrals.map((r) => {
              const st = REFERRAL_STATUS_TH[r.status] ?? {
                label: r.status,
                tone: "#64748b",
              };
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.625rem 0.875rem",
                    background: "#f8fafc",
                    borderRadius: "0.5rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <span>สมัครเมื่อ {thaiDate(r.signedUpAt)}</span>
                  <span style={{ color: st.tone, fontWeight: 600 }}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Commissions */}
      <section style={card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
          💰 ค่าคอมมิชชั่น
        </h2>
        {commissions.scheduled.length === 0 && commissions.paid.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "#94a3b8" }}>
            ยังไม่มีค่าคอมมิชชั่น — เกิดขึ้นเมื่อคนที่คุณแนะนำจ่ายเงินต่อเนื่อง
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.375rem" }}>
            {[...commissions.scheduled, ...commissions.paid].map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.875rem",
                  background: c.status === "paid" ? "#ecfdf5" : "#fffbeb",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                }}
              >
                <span>
                  เดือนที่ {c.monthIndex} ·{" "}
                  {c.status === "paid"
                    ? `จ่ายแล้ว ${thaiDate(c.paidAt)}`
                    : `กำหนดจ่าย ${thaiDate(c.scheduledFor)}`}
                </span>
                <strong
                  style={{ color: c.status === "paid" ? "#16a34a" : "#d97706" }}
                >
                  {baht(Number(c.amountTHB))}
                </strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
