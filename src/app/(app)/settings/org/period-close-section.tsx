"use client";

// ===========================================
// CTRL-01: ปิดงวดบัญชี — ปิดแล้วเอกสาร/รายการของเดือนนั้นแก้ ยกเลิก หรือออกย้อนหลังไม่ได้
// ผู้มีสิทธิ์: เจ้าขององค์กร (เสมอ) + คนที่เจ้าของ/ผู้มีสิทธิ์มอบให้
// ===========================================

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { yearMonthBangkok } from "@/lib/utils/date";
import { prevMonth, thaiPeriodLabel } from "@/lib/period-close";

export function PeriodCloseSection() {
  const utils = trpc.useUtils();
  const q = trpc.periodClose.get.useQuery();
  const closeMut = trpc.periodClose.close.useMutation();
  const reopenMut = trpc.periodClose.reopen.useMutation();
  const managersMut = trpc.periodClose.setManagers.useMutation();
  const lastMonth = prevMonth(yearMonthBangkok());
  const [month, setMonth] = useState(lastMonth);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const d = q.data;
  const refresh = () => utils.periodClose.get.invalidate();

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
      setNotice(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const onClose = () => {
    if (!window.confirm(`ปิดงวดถึง ${thaiPeriodLabel(month)}?\nเอกสารและรายการจ่ายที่ลงงวดถึงเดือนนี้จะแก้/ยกเลิก/ออกย้อนหลังไม่ได้จนกว่าจะเปิดงวด`)) return;
    void run(() => closeMut.mutateAsync({ month }), `ปิดงวดถึง ${thaiPeriodLabel(month)} แล้ว`);
  };
  const onReopen = () => {
    const reason = window.prompt(`เปิดงวดตั้งแต่ ${thaiPeriodLabel(month)} (เดือนนี้และหลังจากนี้แก้ไขได้)\n\nเหตุผล (จำเป็น — บันทึกใน log):`, "");
    if (reason === null) return;
    void run(() => reopenMut.mutateAsync({ month, reason: reason.trim() }), `เปิดงวดตั้งแต่ ${thaiPeriodLabel(month)} แล้ว`);
  };
  const toggleManager = (userId: string, on: boolean) => {
    if (!d) return;
    const next = on ? [...d.managers, userId] : d.managers.filter((id) => id !== userId);
    void run(() => managersMut.mutateAsync({ userIds: next }), "บันทึกผู้มีสิทธิ์แล้ว");
  };

  return (
    <div className="app-card">
      <div className="app-card-header">
        <div>
          <h2 className="app-card-title">🔒 ปิดงวดบัญชี</h2>
          <p className="app-card-subtitle">
            ยื่น ภ.พ.30 / ภ.ง.ด. ของเดือนไหนแล้ว ให้ปิดงวดเดือนนั้น — ระบบจะไม่ให้แก้ ยกเลิก หรือออกเอกสารย้อนหลังเข้าเดือนนั้น
          </p>
        </div>
      </div>

      {q.isLoading && <p style={{ color: "#64748b" }}>กำลังโหลด…</p>}
      {error && <div className="app-error-msg">{error}</div>}
      {notice && <div style={{ color: "#166534", fontSize: "0.875rem", marginBottom: "0.5rem" }}>{notice}</div>}

      {d && (
        <div style={{ display: "grid", gap: "0.875rem", fontSize: "0.875rem" }}>
          <div>
            สถานะ:{" "}
            <strong>{d.closedThrough ? `ปิดงวดถึง ${d.closedLabel}` : "ยังไม่ได้ปิดงวด"}</strong>
          </div>

          {d.canManage ? (
            <>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="month"
                  value={month}
                  max={lastMonth}
                  onChange={(e) => setMonth(e.target.value)}
                  className="app-input"
                  style={{ maxWidth: 180 }}
                  aria-label="เดือน"
                />
                <span style={{ color: "#64748b" }}>{thaiPeriodLabel(month)}</span>
                <button type="button" className="app-btn app-btn-primary app-btn-sm" onClick={onClose} disabled={closeMut.isPending}>
                  ปิดงวดถึงเดือนนี้
                </button>
                {d.closedThrough && (
                  <button type="button" className="app-btn app-btn-ghost app-btn-sm" style={{ color: "#b45309" }} onClick={onReopen} disabled={reopenMut.isPending}>
                    เปิดงวดตั้งแต่เดือนนี้
                  </button>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>ผู้มีสิทธิ์ปิด/เปิดงวด</div>
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  {d.members.map((m) => (
                    <label key={m.userId} className="app-checkbox">
                      <input
                        type="checkbox"
                        checked={m.isManager}
                        disabled={m.isOwner || managersMut.isPending}
                        onChange={(e) => toggleManager(m.userId, e.target.checked)}
                      />
                      {m.name}
                      {m.isOwner ? " (เจ้าของ — มีสิทธิ์เสมอ)" : ""}
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: "#64748b", margin: 0 }}>คุณไม่มีสิทธิ์ปิด/เปิดงวด — ขอสิทธิ์จากเจ้าขององค์กร</p>
          )}
        </div>
      )}
    </div>
  );
}
