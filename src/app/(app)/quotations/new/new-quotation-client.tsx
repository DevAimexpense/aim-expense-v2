"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

// ===== Helpers =====

const round2 = (n: number) => Math.round(n * 100) / 100;

function computeTotalsClient(
  lines: { quantity: number; unitPrice: number; discountPercent: number }[],
  vatIncluded: boolean,
  discountAmount: number
) {
  const lineTotals = lines.map((l) =>
    round2(l.quantity * l.unitPrice * (1 - l.discountPercent / 100))
  );
  const sumLines = lineTotals.reduce((a, b) => a + b, 0);
  if (vatIncluded) {
    const grandTotal = round2(sumLines - discountAmount);
    const vatAmount = round2((grandTotal * 7) / 107);
    const subtotal = round2(grandTotal - vatAmount);
    return { lineTotals, subtotal, vatAmount, grandTotal };
  } else {
    const subtotal = round2(sumLines - discountAmount);
    const vatAmount = round2(subtotal * 0.07);
    const grandTotal = round2(subtotal + vatAmount);
    return { lineTotals, subtotal, vatAmount, grandTotal };
  }
}

const formatTHB = (n: number) =>
  n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function plus30DaysISO() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

// ===== Types =====

interface LineState {
  id: string; // local id for React key
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  notes: string;
}

const newLineId = () => Math.random().toString(36).slice(2, 9);

interface FormState {
  customerId: string;
  docDate: string;
  validUntil: string;
  projectName: string;
  eventId: string;
  vatIncluded: boolean;
  discountAmount: number;
  notes: string;
  terms: string;
  lines: LineState[];
}

// Optional initial values — for /quotations/[id]/edit reuse
export interface InitialQuotationData {
  quotationId: string;
  customerId: string;
  docDate: string;
  validUntil: string;
  projectName: string;
  eventId: string;
  vatIncluded: boolean;
  discountAmount: number;
  notes: string;
  terms: string;
  lines: {
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    notes: string;
  }[];
}

interface Props {
  mode: "create" | "edit";
  initial?: InitialQuotationData;
}

// ===== Component =====

export function NewQuotationClient({ mode, initial }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const customersQuery = trpc.customer.list.useQuery();
  const eventsQuery = trpc.event.list.useQuery();
  const customers = customersQuery.data || [];
  const events = eventsQuery.data || [];

  const createMut = trpc.quotation.create.useMutation();
  const updateMut = trpc.quotation.update.useMutation();

  const [form, setForm] = useState<FormState>(() => ({
    customerId: initial?.customerId || "",
    docDate: initial?.docDate || todayISO(),
    validUntil: initial?.validUntil || plus30DaysISO(),
    projectName: initial?.projectName || "",
    eventId: initial?.eventId || "",
    vatIncluded: initial?.vatIncluded ?? false,
    discountAmount: initial?.discountAmount || 0,
    notes: initial?.notes || "",
    terms: initial?.terms || "",
    lines:
      initial?.lines.map((l) => ({
        id: newLineId(),
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        notes: l.notes,
      })) || [
        {
          id: newLineId(),
          description: "",
          quantity: 1,
          unitPrice: 0,
          discountPercent: 0,
          notes: "",
        },
      ],
  }));
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCustomer = customers.find(
    (c) => c.customerId === form.customerId
  );

  const totals = useMemo(
    () =>
      computeTotalsClient(form.lines, form.vatIncluded, form.discountAmount),
    [form.lines, form.vatIncluded, form.discountAmount]
  );

  // ===== Handlers =====

  const updateLine = (id: string, patch: Partial<LineState>) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  };

  const addLine = () => {
    setForm((f) => ({
      ...f,
      lines: [
        ...f.lines,
        {
          id: newLineId(),
          description: "",
          quantity: 1,
          unitPrice: 0,
          discountPercent: 0,
          notes: "",
        },
      ],
    }));
  };

  const removeLine = (id: string) => {
    setForm((f) =>
      f.lines.length > 1
        ? { ...f, lines: f.lines.filter((l) => l.id !== id) }
        : f
    );
  };

  const validate = (): string | null => {
    if (!form.customerId) return "กรุณาเลือกลูกค้า";
    if (!form.docDate) return "กรุณาระบุวันที่ออก";
    if (!form.validUntil) return "กรุณาระบุวันหมดอายุ";
    if (form.validUntil < form.docDate)
      return "วันหมดอายุต้องไม่น้อยกว่าวันที่ออก";
    if (form.lines.length === 0) return "ต้องมีอย่างน้อย 1 รายการ";
    for (const [idx, l] of form.lines.entries()) {
      if (!l.description.trim()) return `รายการที่ ${idx + 1}: กรุณากรอกรายละเอียด`;
      if (l.quantity <= 0) return `รายการที่ ${idx + 1}: จำนวนต้องมากกว่า 0`;
      if (l.unitPrice < 0)
        return `รายการที่ ${idx + 1}: ราคาต่อหน่วยต้องไม่ติดลบ`;
      if (l.discountPercent < 0 || l.discountPercent > 100)
        return `รายการที่ ${idx + 1}: ส่วนลด % ต้องอยู่ระหว่าง 0-100`;
    }
    if (form.discountAmount < 0)
      return "ส่วนลดท้ายบิลต้องไม่ติดลบ";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    const payload = {
      docDate: form.docDate,
      validUntil: form.validUntil,
      customerId: form.customerId,
      eventId: form.eventId || undefined,
      projectName: form.projectName.trim() || undefined,
      vatIncluded: form.vatIncluded,
      discountAmount: form.discountAmount,
      notes: form.notes.trim() || undefined,
      terms: form.terms.trim() || undefined,
      lines: form.lines.map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        notes: l.notes.trim() || undefined,
      })),
    };
    try {
      if (mode === "edit" && initial) {
        await updateMut.mutateAsync({
          quotationId: initial.quotationId,
          ...payload,
        });
        utils.quotation.list.invalidate();
        utils.quotation.getById.invalidate({
          quotationId: initial.quotationId,
        });
        router.push(`/quotations/${initial.quotationId}`);
      } else {
        const result = await createMut.mutateAsync(payload);
        utils.quotation.list.invalidate();
        router.push(`/quotations/${result.quotationId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const isLoading = createMut.isPending || updateMut.isPending;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">
            {mode === "edit" ? "✏️ แก้ไขใบเสนอราคา" : "📜 สร้างใบเสนอราคา"}
          </h1>
          <p className="app-page-subtitle">
            กรอกข้อมูลลูกค้า + รายการ + เงื่อนไข แล้วบันทึกเป็น draft
          </p>
        </div>
        <Link href="/quotations" className="app-btn app-btn-secondary">
          ← กลับ
        </Link>
      </div>

      {error && <div className="app-error-msg">{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Section 1: Customer */}
        <div className="app-card" style={{ marginBottom: "1rem" }}>
          <div className="app-card-header">
            <h2 className="app-card-title">1. ลูกค้า</h2>
          </div>

          <div className="app-form-group">
            <label className="app-label app-label-required">เลือกลูกค้า</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <select
                value={form.customerId}
                onChange={(e) =>
                  setForm({ ...form, customerId: e.target.value })
                }
                className="app-select"
                style={{ flex: 1 }}
              >
                <option value="">— เลือกลูกค้า —</option>
                {customers.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.customerName}
                    {c.taxId ? ` (${c.taxId})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowCustomerModal(true)}
                className="app-btn app-btn-secondary"
              >
                + เพิ่มลูกค้าใหม่
              </button>
            </div>
          </div>

          {selectedCustomer && (
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.75rem",
                background: "#f8fafc",
                borderRadius: "0.5rem",
                fontSize: "0.8125rem",
              }}
            >
              <div>
                <strong>เลขผู้เสียภาษี:</strong>{" "}
                {selectedCustomer.taxId || "-"}{" "}
                {selectedCustomer.branchType === "Branch"
                  ? `(สาขา ${selectedCustomer.branchNumber})`
                  : "(สำนักงานใหญ่)"}
              </div>
              {selectedCustomer.address && (
                <div>
                  <strong>ที่อยู่:</strong> {selectedCustomer.address}
                </div>
              )}
              <div>
                <strong>เครดิต:</strong> {selectedCustomer.paymentTerms}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Document info */}
        <div className="app-card" style={{ marginBottom: "1rem" }}>
          <div className="app-card-header">
            <h2 className="app-card-title">2. ข้อมูลเอกสาร</h2>
          </div>
          <div className="app-form-grid cols-2">
            <div className="app-form-group">
              <label className="app-label app-label-required">วันที่ออก</label>
              <input
                type="date"
                value={form.docDate}
                onChange={(e) => setForm({ ...form, docDate: e.target.value })}
                className="app-input"
              />
            </div>
            <div className="app-form-group">
              <label className="app-label app-label-required">ใช้ได้ถึง</label>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) =>
                  setForm({ ...form, validUntil: e.target.value })
                }
                className="app-input"
              />
            </div>
          </div>
          <div className="app-form-grid cols-2">
            <div className="app-form-group">
              <label className="app-label">ชื่อโครงการ / งาน</label>
              <input
                type="text"
                value={form.projectName}
                onChange={(e) =>
                  setForm({ ...form, projectName: e.target.value })
                }
                placeholder="ระบุชื่อโครงการ (ลูกค้าใช้)"
                className="app-input"
                maxLength={200}
              />
            </div>
            <div className="app-form-group">
              <label className="app-label">โปรเจกต์ภายใน (optional)</label>
              <select
                value={form.eventId}
                onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                className="app-select"
              >
                <option value="">— ไม่ผูกโปรเจกต์ —</option>
                {events.map((ev) => (
                  <option key={ev.eventId} value={ev.eventId}>
                    {ev.eventName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Lines */}
        <div className="app-card" style={{ marginBottom: "1rem" }}>
          <div className="app-card-header">
            <h2 className="app-card-title">3. รายการ</h2>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="app-table" style={{ minWidth: "720px" }}>
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  <th>รายละเอียด</th>
                  <th style={{ width: "90px" }}>จำนวน</th>
                  <th style={{ width: "120px" }}>ราคา/หน่วย</th>
                  <th style={{ width: "80px" }}>ส่วนลด %</th>
                  <th style={{ width: "120px" }} className="text-right">
                    ยอดรวม
                  </th>
                  <th style={{ width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, idx) => (
                  <tr key={line.id}>
                    <td className="text-center">{idx + 1}</td>
                    <td>
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) =>
                          updateLine(line.id, { description: e.target.value })
                        }
                        className="app-input"
                        placeholder="เช่น ค่าออกแบบโลโก้"
                        maxLength={500}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(line.id, {
                            quantity: parseFloat(e.target.value) || 0,
                          })
                        }
                        min={0}
                        step={0.01}
                        className="app-input num"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={line.unitPrice}
                        onChange={(e) =>
                          updateLine(line.id, {
                            unitPrice: parseFloat(e.target.value) || 0,
                          })
                        }
                        min={0}
                        step={0.01}
                        className="app-input num"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={line.discountPercent}
                        onChange={(e) =>
                          updateLine(line.id, {
                            discountPercent: parseFloat(e.target.value) || 0,
                          })
                        }
                        min={0}
                        max={100}
                        step={0.5}
                        className="app-input num"
                      />
                    </td>
                    <td className="text-right num">
                      {formatTHB(totals.lineTotals[idx] || 0)}
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        disabled={form.lines.length <= 1}
                        className="app-btn app-btn-ghost app-btn-icon app-btn-sm"
                        style={{
                          color:
                            form.lines.length <= 1 ? "#cbd5e1" : "#dc2626",
                        }}
                        title="ลบ"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addLine}
            className="app-btn app-btn-secondary app-btn-sm"
            style={{ marginTop: "0.75rem" }}
          >
            + เพิ่มรายการ
          </button>
        </div>

        {/* Section 4: Totals + VAT */}
        <div className="app-card" style={{ marginBottom: "1rem" }}>
          <div className="app-card-header">
            <h2 className="app-card-title">4. ยอดรวม</h2>
          </div>
          <div className="app-form-grid cols-2">
            <div>
              <div className="app-form-group">
                <label className="app-label">โหมด VAT</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <label
                    style={{
                      flex: 1,
                      padding: "0.5rem 0.75rem",
                      border: `2px solid ${form.vatIncluded ? "#e2e8f0" : "#2563eb"}`,
                      background: form.vatIncluded ? "white" : "#eff6ff",
                      borderRadius: "0.5rem",
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <input
                      type="radio"
                      checked={!form.vatIncluded}
                      onChange={() => setForm({ ...form, vatIncluded: false })}
                      style={{ marginRight: "0.5rem" }}
                    />
                    ราคายังไม่รวม VAT (บวก 7%)
                  </label>
                  <label
                    style={{
                      flex: 1,
                      padding: "0.5rem 0.75rem",
                      border: `2px solid ${form.vatIncluded ? "#2563eb" : "#e2e8f0"}`,
                      background: form.vatIncluded ? "#eff6ff" : "white",
                      borderRadius: "0.5rem",
                      cursor: "pointer",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <input
                      type="radio"
                      checked={form.vatIncluded}
                      onChange={() => setForm({ ...form, vatIncluded: true })}
                      style={{ marginRight: "0.5rem" }}
                    />
                    ราคารวม VAT แล้ว
                  </label>
                </div>
              </div>
              <div className="app-form-group">
                <label className="app-label">ส่วนลดท้ายบิล (บาท)</label>
                <input
                  type="number"
                  value={form.discountAmount}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      discountAmount: parseFloat(e.target.value) || 0,
                    })
                  }
                  min={0}
                  step={0.01}
                  className="app-input num"
                />
              </div>
            </div>

            <div
              style={{
                background: "#f8fafc",
                padding: "1rem",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                }}
              >
                <span>ราคา (ก่อน VAT):</span>
                <span className="num">{formatTHB(totals.subtotal)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                }}
              >
                <span>VAT 7%:</span>
                <span className="num">{formatTHB(totals.vatAmount)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderTop: "1px solid #cbd5e1",
                  paddingTop: "0.5rem",
                  fontWeight: 700,
                  fontSize: "1rem",
                }}
              >
                <span>ยอดรวมสุทธิ:</span>
                <span className="num">{formatTHB(totals.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 5: Notes + Terms */}
        <div className="app-card" style={{ marginBottom: "1rem" }}>
          <div className="app-card-header">
            <h2 className="app-card-title">5. หมายเหตุ + เงื่อนไข</h2>
          </div>
          <div className="app-form-grid cols-2">
            <div className="app-form-group">
              <label className="app-label">หมายเหตุ</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
                className="app-textarea"
                maxLength={1000}
              />
            </div>
            <div className="app-form-group">
              <label className="app-label">เงื่อนไขการชำระ / ส่งมอบ</label>
              <textarea
                value={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
                rows={4}
                className="app-textarea"
                placeholder="เช่น ชำระเงินมัดจำ 50% ก่อนเริ่มงาน"
                maxLength={1000}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
          }}
        >
          <Link href="/quotations" className="app-btn app-btn-secondary">
            ยกเลิก
          </Link>
          <button
            type="submit"
            disabled={isLoading}
            className="app-btn app-btn-primary"
          >
            {isLoading ? (
              <>
                <span className="app-spinner" />
                กำลังบันทึก...
              </>
            ) : mode === "edit" ? (
              "💾 บันทึกการแก้ไข"
            ) : (
              "💾 บันทึก draft"
            )}
          </button>
        </div>
      </form>

      {showCustomerModal && (
        <InlineCustomerModal
          onClose={() => setShowCustomerModal(false)}
          onCreated={(newId) => {
            setForm((f) => ({ ...f, customerId: newId }));
            setShowCustomerModal(false);
            utils.customer.list.invalidate();
          }}
        />
      )}
    </div>
  );
}

// ===== Inline customer modal — minimal version of CustomerModal =====

function InlineCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (customerId: string) => void;
}) {
  const createMut = trpc.customer.create.useMutation();
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branchType, setBranchType] = useState<"HQ" | "Branch">("HQ");
  const [branchNumber, setBranchNumber] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("กรุณากรอกชื่อลูกค้า");
      return;
    }
    try {
      const result = await createMut.mutateAsync({
        customerName: name.trim(),
        taxId: taxId.trim() || undefined,
        branchType,
        branchNumber:
          branchType === "Branch" ? branchNumber.trim() || undefined : undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        paymentTerms: "NET 30",
        defaultWHTPercent: 0,
        isVAT: false,
      });
      onCreated(result.customerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div
      className="app-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="app-modal modal-lg">
        <form onSubmit={handleSubmit}>
          <div className="app-modal-header">
            <h3 className="app-modal-title">เพิ่มลูกค้าใหม่ (ด่วน)</h3>
            <button
              type="button"
              onClick={onClose}
              className="app-btn app-btn-ghost app-btn-icon"
            >
              ✕
            </button>
          </div>

          <div className="app-modal-body">
            {error && <div className="app-error-msg">{error}</div>}
            <p
              style={{
                fontSize: "0.8125rem",
                color: "#64748b",
                marginBottom: "0.75rem",
              }}
            >
              เพิ่มข้อมูลพื้นฐาน — ตั้งค่าเพิ่มเติม (เครดิต/WHT) ได้ที่{" "}
              <Link href="/customers" target="_blank" style={{ color: "#2563eb" }}>
                /customers
              </Link>
            </p>

            <div className="app-form-group">
              <label className="app-label app-label-required">ชื่อลูกค้า</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="app-input"
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label">เลขผู้เสียภาษี</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={taxId}
                  onChange={(e) =>
                    setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))
                  }
                  className="app-input mono"
                  maxLength={13}
                />
              </div>
              <div className="app-form-group">
                <label className="app-label">สำนักงาน</label>
                <select
                  value={branchType}
                  onChange={(e) =>
                    setBranchType(e.target.value as "HQ" | "Branch")
                  }
                  className="app-select"
                >
                  <option value="HQ">สำนักงานใหญ่</option>
                  <option value="Branch">สาขา</option>
                </select>
              </div>
            </div>
            {branchType === "Branch" && (
              <div className="app-form-group">
                <label className="app-label">เลขสาขา</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={branchNumber}
                  onChange={(e) =>
                    setBranchNumber(
                      e.target.value.replace(/\D/g, "").slice(0, 5)
                    )
                  }
                  className="app-input mono"
                  maxLength={5}
                />
              </div>
            )}
            <div className="app-form-group">
              <label className="app-label">ที่อยู่</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className="app-textarea"
                maxLength={500}
              />
            </div>
            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label">เบอร์โทร</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="app-input"
                />
              </div>
              <div className="app-form-group">
                <label className="app-label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="app-input"
                />
              </div>
            </div>
          </div>

          <div className="app-modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="app-btn app-btn-secondary"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="app-btn app-btn-primary"
            >
              {createMut.isPending ? (
                <>
                  <span className="app-spinner" /> กำลังบันทึก...
                </>
              ) : (
                "เพิ่มลูกค้า"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
