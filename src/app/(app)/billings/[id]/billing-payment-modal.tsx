"use client";

// ===========================================
// บันทึกรับเงินของใบวางบิล — ใช้กับใบที่ "ออกใบกำกับภาษีไม่ได้" (กิจการไม่จด VAT
// หรือใบวางบิลที่ไม่มี VAT) ซึ่งต้องไปต่อทางใบเสร็จรับเงิน
// (ใบที่มี VAT บันทึกรับเงินที่หน้าใบกำกับภาษีเหมือนเดิม — S25B)
//
// ยอดที่บันทึก = ยอดตัดหนี้ตามยอดรวมเอกสาร (GrandTotal) นิยามเดียวกับ "รับแล้ว / คงค้าง"
// ในหน้าใบวางบิล — กรณีมีหัก ณ ที่จ่าย ลูกค้าโอนจริงน้อยกว่านี้ (ส่วนต่าง = ภาษีที่ลูกค้าหักไว้)
// ===========================================

import { useState } from "react";
import { todayBangkok } from "@/lib/utils/date";
import { trpc } from "@/lib/trpc/client";
import DateInput from "@/components/shared/date-input";

const round2 = (n: number) => Math.round(n * 100) / 100;
const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_METHODS = [
  { value: "transfer", label: "เงินโอน" },
  { value: "cash", label: "เงินสด" },
  { value: "cheque", label: "เช็ค" },
] as const;
type Method = (typeof PAYMENT_METHODS)[number]["value"];

export function RecordBillingPaymentModal({
  billingId,
  docNumber,
  grandTotal,
  balance,
  whtPercent,
  whtAmount,
  onClose,
  onSuccess,
}: {
  billingId: string;
  docNumber: string;
  grandTotal: number;
  /** ยอดคงค้าง (GrandTotal − รับแล้ว) */
  balance: number;
  whtPercent: number;
  whtAmount: number;
  onClose: () => void;
  onSuccess: (newStatus: string) => void;
}) {
  const recordMut = trpc.billing.recordPayment.useMutation();
  const today = todayBangkok();
  const [paidDate, setPaidDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<Method>("transfer");
  const [amount, setAmount] = useState(String(round2(balance)));
  const [error, setError] = useState<string | null>(null);

  const amountNum = round2(parseFloat(amount) || 0);
  const isFull = amountNum === round2(balance);
  // รับครบทั้งใบครั้งเดียว + มีหัก ณ ที่จ่าย → บอกยอดที่ลูกค้าโอนจริง
  const showWhtHint = whtAmount > 0 && isFull && round2(balance) === round2(grandTotal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!paidDate) return setError("กรุณาเลือกวันที่รับเงิน");
    if (amountNum <= 0) return setError("จำนวนเงินต้องมากกว่า 0");
    if (amountNum > round2(balance)) {
      return setError(`จำนวนเงินเกินยอดคงค้าง (${formatTHB(balance)} บาท)`);
    }
    try {
      const res = await recordMut.mutateAsync({ billingId, amount: amountNum, paidDate, paymentMethod });
      onSuccess(res.newStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    }
  };

  const isLoading = recordMut.isPending;

  return (
    <div
      className="app-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && !isLoading && onClose()}
    >
      <div className="app-modal" style={{ maxWidth: "520px" }}>
        <form onSubmit={handleSubmit}>
          <div className="app-modal-header">
            <h3 className="app-modal-title">💰 บันทึกรับเงิน</h3>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="app-btn app-btn-ghost app-btn-icon"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>
          <div className="app-modal-body">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "0.5rem",
                padding: "0.625rem 0.875rem",
                marginBottom: "1rem",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", color: "#166534" }}>ใบวางบิล</div>
                <div className="mono" style={{ fontWeight: 700, color: "#14532d" }}>
                  {docNumber}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.75rem", color: "#166534" }}>ยอดคงค้าง</div>
                <div className="num" style={{ fontSize: "1.125rem", fontWeight: 700, color: "#14532d" }}>
                  {formatTHB(balance)}
                </div>
              </div>
            </div>

            {error && <div className="app-error-msg">{error}</div>}

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label app-label-required">วันที่รับเงิน</label>
                <DateInput value={paidDate} onChange={(v) => setPaidDate(v)} max={today} className="app-input" />
              </div>
              <div className="app-form-group">
                <label className="app-label app-label-required">วิธีรับเงิน</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as Method)}
                  className="app-select"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="app-form-group">
              <label className="app-label app-label-required">
                ยอดที่รับชำระ (บาท){whtAmount > 0 ? " — รวมภาษีที่ลูกค้าหัก ณ ที่จ่าย" : ""}
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={round2(balance)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="app-input num"
              />
              {showWhtHint ? (
                <p className="app-hint">
                  ลูกค้าโอนจริง {formatTHB(round2(grandTotal - whtAmount))} บาท + หัก ณ ที่จ่าย{" "}
                  {whtPercent}% {formatTHB(whtAmount)} บาท = {formatTHB(grandTotal)} บาท
                </p>
              ) : (
                <p className="app-hint">
                  {isFull ? "รับครบ → สถานะเป็น “ชำระครบ” แล้วออกใบเสร็จรับเงินได้" : "รับไม่ครบ → สถานะเป็น “รับบางส่วน”"}
                </p>
              )}
            </div>
          </div>
          <div className="app-modal-footer">
            <button type="button" onClick={onClose} disabled={isLoading} className="app-btn app-btn-secondary">
              ยกเลิก
            </button>
            <button type="submit" disabled={isLoading} className="app-btn app-btn-primary">
              {isLoading ? (
                <>
                  <span className="app-spinner" /> กำลังบันทึก...
                </>
              ) : (
                "บันทึกรับเงิน"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
