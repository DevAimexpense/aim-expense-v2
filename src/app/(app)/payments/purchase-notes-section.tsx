"use client";

// ===========================================
// PUR-11: ใบลด/เพิ่มหนี้ที่ได้รับจากผู้ขาย — แสดง/บันทึก/ยกเลิก ในรายละเอียดรายการจ่ายที่จ่ายแล้ว
// ภาษีซื้อปรับในเดือนที่ได้รับใบ (ม.82/10) · รายการเดิมไม่เปลี่ยน
// ===========================================

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import DateInput from "@/components/shared/date-input";
import { formatDate, todayBangkok } from "@/lib/utils/date";
import { formatNumber } from "@/lib/calculations";
import { roundMoney } from "@/lib/money";

type Props = {
  paymentId: string;
  description: string;
  /** ยอดเดิม (ก่อน VAT) และ VAT ของรายการ — ใช้ตั้งค่าเริ่มต้น/บอกยอดคงเหลือ */
  ttlAmount: number;
  vatAmount: number;
  /** admin หรือมีสิทธิ์แก้ไขหลังอนุมัติ */
  canAdjust: boolean;
};

const EMPTY = {
  kind: "credit" as "credit" | "debit",
  vendorDocNumber: "",
  vendorDocDate: "",
  receivedDate: "",
  base: "",
  vat: "",
  reason: "",
};

export function PurchaseNotesSection({ paymentId, description, ttlAmount, vatAmount, canAdjust }: Props) {
  const utils = trpc.useUtils();
  const listQuery = trpc.purchaseNote.list.useQuery({ paymentId });
  const createMut = trpc.purchaseNote.create.useMutation();
  const voidMut = trpc.purchaseNote.void.useMutation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY, receivedDate: todayBangkok() });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const notes = listQuery.data || [];
  const active = notes.filter((n) => n.status === "active");
  const netBase = active.reduce((s, n) => s + (n.kind === "debit" ? 1 : -1) * n.baseAmount, 0);
  const netVat = active.reduce((s, n) => s + (n.kind === "debit" ? 1 : -1) * n.vatAmount, 0);
  const hasVat = vatAmount > 0;

  const setBase = (v: string) => {
    const b = parseFloat(v);
    // VAT ค่าเริ่มต้น = 7% ของมูลค่า (แก้ได้ตามใบจริง) · รายการเดิมไม่มี VAT → 0
    setForm((f) => ({ ...f, base: v, vat: hasVat && Number.isFinite(b) ? roundMoney(b * 0.07).toFixed(2) : "0" }));
  };

  const reload = () => {
    utils.purchaseNote.list.invalidate();
    utils.report.invalidate();
  };

  const save = async () => {
    setError(null);
    const base = parseFloat(form.base);
    const vat = parseFloat(form.vat || "0");
    if (!form.vendorDocNumber.trim()) return setError("กรุณากรอกเลขที่ใบของผู้ขาย");
    if (!form.vendorDocDate || !form.receivedDate) return setError("กรุณาเลือกวันที่บนใบและวันที่ได้รับ");
    if (!(base > 0)) return setError("มูลค่าต้องมากกว่า 0");
    if (form.reason.trim().length < 3) return setError("กรุณาระบุเหตุ");
    setSaving(true);
    const payload = {
      paymentId,
      kind: form.kind,
      vendorDocNumber: form.vendorDocNumber.trim(),
      vendorDocDate: form.vendorDocDate,
      receivedDate: form.receivedDate,
      baseAmount: base,
      vatAmount: Number.isFinite(vat) ? vat : 0,
      reason: form.reason.trim(),
    };
    try {
      let fileUrl = "";
      if (file) {
        // PUR-11b: ตรวจยอด/สิทธิ์/งวดก่อน — ไม่ผ่านจะไม่อัปโหลดไฟล์ (ไม่มีไฟล์ค้างใน Drive)
        await createMut.mutateAsync({ ...payload, dryRun: true });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("paymentId", paymentId);
        fd.append("fileType", "vendor_note");
        fd.append("invoiceNumber", form.vendorDocNumber.trim());
        fd.append("receiptDate", form.vendorDocDate);
        fd.append("description", `${form.kind === "credit" ? "ใบลดหนี้" : "ใบเพิ่มหนี้"}-${description}`);
        const res = await fetch("/api/payments/upload", { method: "POST", body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "อัปโหลดไฟล์ไม่สำเร็จ");
        fileUrl = d.fileUrl || "";
      }
      const r = await createMut.mutateAsync({ ...payload, fileUrl: fileUrl || undefined });
      if (r.warning) alert(r.warning);
      setForm({ ...EMPTY, receivedDate: todayBangkok() });
      setFile(null);
      setOpen(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const voidNote = async (noteId: string, docNo: string) => {
    const reason = window.prompt(`เหตุผลที่ยกเลิกใบ ${docNo}`);
    if (!reason || reason.trim().length < 3) return;
    try {
      await voidMut.mutateAsync({ noteId, reason: reason.trim() });
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ");
    }
  };

  if (!canAdjust && notes.length === 0) return null;

  return (
    <div
      className="app-form-group"
      style={{ border: "1px solid #e2e8f0", borderRadius: "0.5rem", padding: "0.75rem" }}
      // อยู่ในฟอร์มแก้รายการจ่าย — กด Enter ในช่องนี้ต้องไม่ไปบันทึกรายการจ่าย
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <label className="app-label" style={{ margin: 0 }}>🧾 ใบลด/เพิ่มหนี้จากผู้ขาย</label>
        {canAdjust && !open && (
          <button type="button" className="app-btn app-btn-secondary" style={{ fontSize: "0.8125rem" }} onClick={() => setOpen(true)}>
            ➕ บันทึกใบที่ได้รับ
          </button>
        )}
      </div>
      <p className="app-hint" style={{ marginTop: "0.25rem" }}>
        ภาษีซื้อปรับในเดือนที่ได้รับใบ (ม.82/10) · รายการเดิมไม่เปลี่ยน
        {active.length > 0 && (
          <>
            {" "}· ปรับแล้วสุทธิ {netBase >= 0 ? "+" : ""}
            {formatNumber(netBase)} (VAT {netVat >= 0 ? "+" : ""}
            {formatNumber(netVat)}) จากยอดเดิม {formatNumber(ttlAmount)}
          </>
        )}
      </p>

      {notes.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0", display: "grid", gap: "0.375rem" }}>
          {notes.map((n) => (
            <li
              key={n.noteId}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center",
                fontSize: "0.8125rem",
                opacity: n.status === "void" ? 0.55 : 1,
              }}
            >
              <span style={{ fontWeight: 600, color: n.kind === "credit" ? "#b91c1c" : "#1d4ed8" }}>
                {n.kind === "credit" ? "ลดหนี้" : "เพิ่มหนี้"}
              </span>
              <span className="mono">{n.vendorDocNumber}</span>
              <span>ได้รับ {formatDate(n.receivedDate)}</span>
              <span className="num">
                {n.kind === "credit" ? "−" : "+"}
                {formatNumber(n.baseAmount)} · VAT {formatNumber(n.vatAmount)}
              </span>
              {n.fileUrl && (
                <a href={n.fileUrl} target="_blank" rel="noopener noreferrer">
                  ไฟล์
                </a>
              )}
              {n.status === "void" ? (
                <span style={{ color: "#64748b" }}>ยกเลิกแล้ว{n.voidReason ? ` (${n.voidReason})` : ""}</span>
              ) : (
                canAdjust && (
                  <button
                    type="button"
                    className="app-btn app-btn-ghost"
                    style={{ fontSize: "0.75rem", padding: "0.125rem 0.5rem" }}
                    onClick={() => voidNote(n.noteId, n.vendorDocNumber)}
                    disabled={voidMut.isPending}
                  >
                    ยกเลิก
                  </button>
                )
              )}
              <span style={{ flexBasis: "100%", color: "#64748b", fontSize: "0.75rem" }}>{n.reason}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {(["credit", "debit"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`app-btn ${form.kind === k ? "app-btn-primary" : "app-btn-secondary"}`}
                style={{ flex: 1 }}
                onClick={() => setForm({ ...form, kind: k })}
              >
                {k === "credit" ? "ใบลดหนี้ (ลดยอด)" : "ใบเพิ่มหนี้ (เพิ่มยอด)"}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem" }}>
            <div>
              <label className="app-label">เลขที่ใบของผู้ขาย</label>
              <input
                className="app-input"
                value={form.vendorDocNumber}
                maxLength={60}
                onChange={(e) => setForm({ ...form, vendorDocNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="app-label">วันที่บนใบ</label>
              <DateInput className="app-input" value={form.vendorDocDate} onChange={(v) => setForm({ ...form, vendorDocDate: v })} />
            </div>
            <div>
              <label className="app-label">วันที่ได้รับใบ (งวดภาษี)</label>
              <DateInput className="app-input" value={form.receivedDate} onChange={(v) => setForm({ ...form, receivedDate: v })} />
            </div>
            <div>
              <label className="app-label">มูลค่าที่{form.kind === "credit" ? "ลด" : "เพิ่ม"} (ก่อน VAT)</label>
              <input className="app-input num" inputMode="decimal" value={form.base} onChange={(e) => setBase(e.target.value)} />
            </div>
            <div>
              <label className="app-label">ภาษีมูลค่าเพิ่มตามใบ</label>
              <input
                className="app-input num"
                inputMode="decimal"
                value={form.vat}
                disabled={!hasVat}
                onChange={(e) => setForm({ ...form, vat: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="app-label">เหตุ (เช่น คืนสินค้า ลดราคา คิดเงินเกิน)</label>
            <textarea
              className="app-textarea"
              rows={2}
              maxLength={500}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
          <div>
            <label className="app-label">ไฟล์ใบลด/เพิ่มหนี้ (ถ้ามี)</label>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          {error && <div className="app-error-msg">{error}</div>}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" className="app-btn app-btn-secondary" onClick={() => setOpen(false)} disabled={saving}>
              ยกเลิก
            </button>
            <button type="button" className="app-btn app-btn-primary" onClick={save} disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
