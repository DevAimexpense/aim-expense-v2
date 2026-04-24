"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

export default function PayeesPage() {
  const utils = trpc.useUtils();
  const payeesQuery = trpc.payee.list.useQuery();
  const payees = payeesQuery.data || [];

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = payees.filter(
    (p) =>
      !search ||
      p.payeeName.toLowerCase().includes(search.toLowerCase()) ||
      p.taxId.includes(search) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  );

  const editingPayee = payees.find((p) => p.payeeId === editingId);

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">👤 ผู้รับเงิน</h1>
          <p className="app-page-subtitle">
            จัดการข้อมูล Vendor, Supplier, Freelance ที่บริษัทจ่ายเงินให้
          </p>
        </div>
        <button
          className="app-btn app-btn-primary"
          onClick={() => {
            setEditingId(null);
            setShowModal(true);
          }}
        >
          + เพิ่มผู้รับเงิน
        </button>
      </div>

      <div className="app-filter-row">
        <input
          type="text"
          placeholder="🔍 ค้นหา ชื่อ, เลขผู้เสียภาษี, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="app-input"
          style={{ minWidth: "280px" }}
        />
      </div>

      {payeesQuery.isLoading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">👤</div>
            <p className="app-empty-title">
              {payees.length === 0 ? "ยังไม่มีผู้รับเงิน" : "ไม่พบผู้รับเงิน"}
            </p>
            <p className="app-empty-desc">
              {payees.length === 0
                ? "เพิ่มข้อมูลผู้รับเงินเพื่อใช้ตอนสร้างรายจ่าย"
                : "ลองเปลี่ยนคำค้นหา"}
            </p>
            {payees.length === 0 && (
              <button onClick={() => setShowModal(true)} className="app-btn app-btn-primary">
                + เพิ่มผู้รับเงินคนแรก
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>เลขผู้เสียภาษี</th>
                <th>ธนาคาร / บัญชี</th>
                <th className="text-center">VAT</th>
                <th className="text-right">WTH%</th>
                <th>ติดต่อ</th>
                <th className="text-center"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.payeeId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.payeeName}</div>
                  </td>
                  <td className="num" style={{ fontFamily: "ui-monospace" }}>
                    {p.taxId || "-"}
                  </td>
                  <td>
                    {p.bankName ? (
                      <div>
                        <div style={{ fontSize: "0.875rem" }}>{p.bankName}</div>
                        {p.bankAccount && (
                          <div style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "ui-monospace" }}>
                            {p.bankAccount}
                          </div>
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="text-center">
                    {p.isVAT ? (
                      <span className="app-badge app-badge-info">VAT</span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>-</span>
                    )}
                  </td>
                  <td className="text-right num">
                    {p.defaultWTH > 0 ? `${p.defaultWTH}%` : "-"}
                  </td>
                  <td>
                    {p.phone && (
                      <div style={{ fontSize: "0.75rem" }}>📞 {p.phone}</div>
                    )}
                    {p.email && (
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        ✉️ {p.email}
                      </div>
                    )}
                    {!p.phone && !p.email && "-"}
                  </td>
                  <td className="text-center">
                    <button
                      className="app-btn app-btn-ghost app-btn-sm"
                      onClick={() => {
                        setEditingId(p.payeeId);
                        setShowModal(true);
                      }}
                    >
                      ✏️ แก้ไข
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <PayeeModal
          payee={editingPayee}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingId(null);
            utils.payee.list.invalidate();
          }}
        />
      )}
    </div>
  );
}

function PayeeModal({
  payee,
  onClose,
  onSuccess,
}: {
  payee?: {
    payeeId: string;
    payeeName: string;
    taxId: string;
    branchType?: "HQ" | "Branch";
    branchNumber?: string;
    bankAccount: string;
    bankName: string;
    isVAT: boolean;
    defaultWTH: number;
    phone: string;
    email: string;
    address: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!payee;
  const utils = trpc.useUtils();
  const createMut = trpc.payee.create.useMutation();
  const updateMut = trpc.payee.update.useMutation();
  const deleteMut = trpc.payee.delete.useMutation();

  const [form, setForm] = useState({
    payeeName: payee?.payeeName || "",
    taxId: payee?.taxId || "",
    branchType: (payee?.branchType || "HQ") as "HQ" | "Branch",
    branchNumber: payee?.branchNumber || "",
    bankAccount: payee?.bankAccount || "",
    bankName: payee?.bankName || "",
    isVAT: payee?.isVAT || false,
    defaultWTH: payee?.defaultWTH || 0,
    phone: payee?.phone || "",
    email: payee?.email || "",
    address: payee?.address || "",
  });
  const [error, setError] = useState<string | null>(null);
  const isLoading = createMut.isPending || updateMut.isPending || deleteMut.isPending;
  const banksQuery = trpc.bank.list.useQuery();
  const banks = banksQuery.data || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.payeeName.trim()) {
      setError("กรุณากรอกชื่อผู้รับเงิน");
      return;
    }
    try {
      const data = {
        payeeName: form.payeeName.trim(),
        taxId: form.taxId.trim() || undefined,
        branchType: form.branchType,
        branchNumber: form.branchType === "Branch" ? form.branchNumber.trim() || undefined : undefined,
        bankAccount: form.bankAccount.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        isVAT: form.isVAT,
        defaultWTH: form.defaultWTH,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
      };
      if (isEdit) {
        await updateMut.mutateAsync({ payeeId: payee.payeeId, ...data });
      } else {
        await createMut.mutateAsync(data);
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!confirm(`ลบ "${payee.payeeName}" ใช่หรือไม่?`)) return;
    setError(null);
    try {
      await deleteMut.mutateAsync({ payeeId: payee.payeeId });
      utils.payee.list.invalidate();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div className="app-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="app-modal modal-lg">
        <form onSubmit={handleSubmit}>
          <div className="app-modal-header">
            <h3 className="app-modal-title">
              {isEdit ? "แก้ไขผู้รับเงิน" : "เพิ่มผู้รับเงินใหม่"}
            </h3>
            <button type="button" onClick={onClose} className="app-btn app-btn-ghost app-btn-icon">
              ✕
            </button>
          </div>

          <div className="app-modal-body">
            {error && <div className="app-error-msg">{error}</div>}

            <div className="app-form-group">
              <label className="app-label app-label-required">ชื่อผู้รับเงิน</label>
              <input
                type="text"
                value={form.payeeName}
                onChange={(e) => setForm({ ...form, payeeName: e.target.value })}
                placeholder="บริษัท / ร้าน / ชื่อบุคคล"
                className="app-input"
                maxLength={200}
                autoFocus
              />
            </div>

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label">เลขประจำตัวผู้เสียภาษี</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.taxId}
                  onChange={(e) =>
                    setForm({ ...form, taxId: e.target.value.replace(/\D/g, "").slice(0, 13) })
                  }
                  placeholder="13 หลัก"
                  className="app-input mono"
                  maxLength={13}
                />
              </div>
              <div className="app-form-group">
                <label className="app-label">% หัก ณ ที่จ่าย (default)</label>
                <input
                  type="number"
                  value={form.defaultWTH}
                  onChange={(e) => setForm({ ...form, defaultWTH: parseFloat(e.target.value) || 0 })}
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder="เช่น 3 (สำหรับ freelance), 1 (บริษัท)"
                  className="app-input num"
                />
                <p className="app-hint">ค่า default ตอนสร้าง payment</p>
              </div>
            </div>

            {/* Branch (HQ / Branch number) — สำคัญสำหรับใบกำกับภาษี */}
            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label">ประเภทสาขา</label>
                <select
                  value={form.branchType}
                  onChange={(e) =>
                    setForm({ ...form, branchType: e.target.value as "HQ" | "Branch" })
                  }
                  className="app-select"
                >
                  <option value="HQ">สำนักงานใหญ่</option>
                  <option value="Branch">สาขา</option>
                </select>
              </div>
              {form.branchType === "Branch" && (
                <div className="app-form-group">
                  <label className="app-label">เลขสาขา</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.branchNumber}
                    onChange={(e) =>
                      setForm({ ...form, branchNumber: e.target.value.replace(/\D/g, "").slice(0, 5) })
                    }
                    placeholder="เช่น 00001"
                    className="app-input mono"
                    maxLength={5}
                  />
                  <p className="app-hint">5 หลัก (มาตรฐานกรมสรรพากร)</p>
                </div>
              )}
            </div>

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label">ธนาคาร</label>
                <select
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  className="app-select"
                >
                  <option value="">— เลือกธนาคาร —</option>
                  {banks.map((b) => (
                    <option key={b.bankId} value={b.bankName}>
                      {b.bankName}
                    </option>
                  ))}
                </select>
                <p className="app-hint">
                  ไม่มีในรายการ?{" "}
                  <a href="/banks" target="_blank" style={{ color: "#2563eb" }}>
                    เพิ่มธนาคารใหม่
                  </a>
                </p>
              </div>
              <div className="app-form-group">
                <label className="app-label">เลขบัญชี</label>
                <input
                  type="text"
                  value={form.bankAccount}
                  onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                  placeholder="xxx-x-xxxxx-x"
                  className="app-input mono"
                />
              </div>
            </div>

            <div className="app-form-group">
              <label className="app-checkbox">
                <input
                  type="checkbox"
                  checked={form.isVAT}
                  onChange={(e) => setForm({ ...form, isVAT: e.target.checked })}
                />
                เป็นผู้ประกอบการ VAT (คิด VAT 7%)
              </label>
            </div>

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label">เบอร์โทร</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="08x-xxx-xxxx"
                  className="app-input"
                />
              </div>
              <div className="app-form-group">
                <label className="app-label">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@example.com"
                  className="app-input"
                />
              </div>
            </div>

            <div className="app-form-group">
              <label className="app-label">ที่อยู่</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="ที่อยู่สำหรับออกใบกำกับภาษี"
                className="app-textarea"
                rows={2}
                maxLength={500}
              />
            </div>
          </div>

          <div className="app-modal-footer">
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isLoading}
                className="app-btn app-btn-ghost"
                style={{ color: "#dc2626", marginRight: "auto" }}
              >
                🗑️ ลบ
              </button>
            )}
            <button type="button" onClick={onClose} disabled={isLoading} className="app-btn app-btn-secondary">
              ยกเลิก
            </button>
            <button type="submit" disabled={isLoading} className="app-btn app-btn-primary">
              {isLoading ? (
                <>
                  <span className="app-spinner" /> กำลังบันทึก...
                </>
              ) : isEdit ? (
                "บันทึก"
              ) : (
                "เพิ่มผู้รับเงิน"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="app-card">
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="app-skeleton" style={{ height: "50px" }} />
        ))}
      </div>
    </div>
  );
}
