"use client";

// ===========================================
// วันที่ใบเสร็จรับเงิน (= วันที่รับเงิน) — ใช้ 2 แบบ
//   issue: ก่อนออกใบเสร็จ ให้เห็น/แก้วันที่ก่อน (ค่าเริ่มต้น = วันที่รับเงินที่บันทึกไว้)
//   edit : แก้วันที่ใบเสร็จที่ออกไปแล้ว (เช่นตอนบันทึกรับเงินลืมเปลี่ยนจาก "วันนี้")
// เลขใบเสร็จคงเดิมเสมอ — ย้ายข้ามเดือนจะได้คำเตือน (DOC-07)
// ===========================================

import { useState } from "react";
import { todayBangkok, formatDate } from "@/lib/utils/date";
import DateInput from "@/components/shared/date-input";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * วันที่จากชีต → YYYY-MM-DD · ค่าที่ถูกแก้ผ่าน updateById (USER_ENTERED) อาจกลับมาเป็น
 * รูปแบบของชีต (เช่น M/D/YYYY ของ en_US) แทน ISO — แปลงให้เหมือนกันก่อนใช้
 */
function toIso(v: string): string {
  if (!v) return "";
  if (ISO_RE.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** เดือนของวันที่ (YYYY-MM) */
const ym = (d: string) => toIso(d).slice(0, 7);

export function ReceiptDateModal({
  mode,
  receiptNumber,
  initialDate,
  paidDate,
  busy,
  onConfirm,
  onClose,
}: {
  mode: "issue" | "edit";
  receiptNumber?: string;
  initialDate: string;
  /** วันที่รับเงินที่บันทึกไว้ (แสดงให้เทียบ) */
  paidDate: string;
  busy: boolean;
  onConfirm: (receiptDate: string, renumber: boolean) => void;
  onClose: () => void;
}) {
  const today = todayBangkok();
  const [date, setDate] = useState(toIso(initialDate) || today);
  const [renumber, setRenumber] = useState(false);
  // แก้ข้ามเดือน → ให้เลือกได้ว่าจะออกเลขใหม่ของเดือนนั้นไหม (ค่าเริ่มต้น: คงเลขเดิม — DOC-07)
  const crossMonth = mode === "edit" && !!ym(initialDate) && ym(date) !== ym(initialDate);

  return (
    <div className="app-modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="app-modal" style={{ maxWidth: "440px" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (date) onConfirm(date, crossMonth && renumber);
          }}
        >
          <div className="app-modal-header">
            <h3 className="app-modal-title">
              {mode === "issue" ? "🧾 ออกใบเสร็จรับเงิน" : `📅 แก้วันที่ใบเสร็จ ${receiptNumber ?? ""}`}
            </h3>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="app-btn app-btn-ghost app-btn-icon"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>
          <div className="app-modal-body">
            <div className="app-form-group">
              <label className="app-label app-label-required">วันที่ใบเสร็จ (วันที่ได้รับเงิน)</label>
              <DateInput value={date} onChange={(v) => setDate(v)} max={today} className="app-input" />
              <p className="app-hint">
                {toIso(paidDate)
                  ? `วันที่รับเงินที่บันทึกไว้: ${formatDate(toIso(paidDate))}`
                  : "ใบเสร็จต้องลงวันที่ที่ได้รับเงินจริง"}
                {mode === "edit" && " · วันที่รับเงินจะเปลี่ยนตามด้วย · เลขใบเสร็จคงเดิม"}
              </p>
            </div>
            {crossMonth && (
              <label
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "flex-start",
                  padding: "0.625rem 0.75rem",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "0.5rem",
                  fontSize: "0.8125rem",
                  color: "#92400e",
                  cursor: "pointer",
                }}
              >
                <input type="checkbox" checked={renumber} onChange={(e) => setRenumber(e.target.checked)} />
                <span>
                  <strong>ออกเลขใหม่ตามเดือนของวันที่ใหม่</strong> (แทน {receiptNumber})
                  <br />
                  ถ้าส่งใบเสร็จเลขเดิมให้ลูกค้าไปแล้ว ต้องส่งใบใหม่แทน · ไม่ติ๊ก = คงเลขเดิม
                </span>
              </label>
            )}
          </div>
          <div className="app-modal-footer">
            <button type="button" onClick={onClose} disabled={busy} className="app-btn app-btn-secondary">
              ยกเลิก
            </button>
            <button type="submit" disabled={busy || !date} className="app-btn app-btn-primary">
              {busy ? (
                <>
                  <span className="app-spinner" /> กำลังบันทึก...
                </>
              ) : mode === "issue" ? (
                "ออกใบเสร็จ"
              ) : (
                "บันทึกวันที่"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
