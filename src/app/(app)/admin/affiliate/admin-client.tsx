"use client";

// ===========================================
// Affiliate admin client — matured-commission payout queue + partner list.
// Select matured commissions → transfer PromptPay by hand → "mark paid".
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
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: "0.75rem",
  color: "#64748b",
  padding: "0.5rem",
  borderBottom: "1px solid #e2e8f0",
};
const td: React.CSSProperties = {
  fontSize: "0.875rem",
  padding: "0.5rem",
  borderBottom: "1px solid #f1f5f9",
};

function baht(n: number): string {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function AdminClient() {
  const utils = trpc.useUtils();
  const matured = trpc.affiliateAdmin.maturedCommissions.useQuery();
  const partners = trpc.affiliateAdmin.partners.useQuery();
  const markPaidMut = trpc.affiliateAdmin.markPaid.useMutation({
    onSuccess: () => {
      utils.affiliateAdmin.maturedCommissions.invalidate();
      utils.affiliateAdmin.partners.invalidate();
      setSelected(new Set());
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = matured.data?.commissions ?? [];
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const selectedTotal = rows
    .filter((r) => selected.has(r.id))
    .reduce((s, r) => s + Number(r.amountTHB), 0);

  const handleMarkPaid = async () => {
    if (selected.size === 0) return;
    await markPaidMut.mutateAsync({ commissionIds: Array.from(selected) });
  };

  return (
    <div>
      {/* Matured payout queue */}
      <section style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
            💸 ค่าคอมมิชชั่นที่ถึงกำหนด ({rows.length})
          </h2>
          <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
            รวมทั้งหมด{" "}
            <strong>{baht(matured.data?.totalTHB ?? 0)}</strong>
          </div>
        </div>

        {matured.isLoading ? (
          <p style={{ color: "#64748b" }}>กำลังโหลด...</p>
        ) : rows.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "#94a3b8" }}>
            ยังไม่มีค่าคอมมิชชั่นที่ถึงกำหนดจ่าย
          </p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                      />
                    </th>
                    <th style={th}>โค้ด</th>
                    <th style={th}>PromptPay</th>
                    <th style={th}>เดือน</th>
                    <th style={th}>กำหนดจ่าย</th>
                    <th style={{ ...th, textAlign: "right" }}>จำนวน</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.partner.code}</td>
                      <td style={{ ...td, fontFamily: "monospace" }}>
                        {r.partner.payoutAccount}
                      </td>
                      <td style={td}>{r.monthIndex}</td>
                      <td style={td}>{thaiDate(r.scheduledFor)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                        {baht(Number(r.amountTHB))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "1rem",
                marginTop: "1rem",
              }}
            >
              {selected.size > 0 && (
                <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
                  เลือก {selected.size} รายการ · {baht(selectedTotal)}
                </span>
              )}
              <button
                onClick={handleMarkPaid}
                disabled={selected.size === 0 || markPaidMut.isPending}
                className="app-btn app-btn-primary"
              >
                {markPaidMut.isPending
                  ? "กำลังบันทึก..."
                  : "✓ ทำเครื่องหมายจ่ายแล้ว"}
              </button>
            </div>
          </>
        )}
      </section>

      {/* Partners */}
      <section style={card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
          👥 พันธมิตรทั้งหมด ({partners.data?.length ?? 0})
        </h2>
        {partners.isLoading ? (
          <p style={{ color: "#64748b" }}>กำลังโหลด...</p>
        ) : (partners.data?.length ?? 0) === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "#94a3b8" }}>ยังไม่มีพันธมิตร</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>โค้ด</th>
                  <th style={th}>PromptPay</th>
                  <th style={th}>แนะนำ</th>
                  <th style={{ ...th, textAlign: "right" }}>จ่ายสะสม</th>
                  <th style={th}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {partners.data!.map((p) => (
                  <tr key={p.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{p.code}</td>
                    <td style={{ ...td, fontFamily: "monospace" }}>
                      {p.payoutAccount}
                    </td>
                    <td style={td}>{p.totalReferrals}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {baht(Number(p.totalCommission))}
                    </td>
                    <td style={td}>
                      {p.isActive ? (
                        <span style={{ color: "#16a34a" }}>ใช้งาน</span>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>ปิด</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
