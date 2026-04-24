"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";

export function CompanyBanksSection({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const banksQuery = trpc.companyBank.list.useQuery();
  const banks = banksQuery.data || [];

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = banks.find((b) => b.companyBankId === editingId);

  return (
    <div className="app-card">
      <div className="app-card-header">
        <div>
          <h2 className="app-card-title">🏦 บัญชีธนาคารของบริษัท</h2>
          <p className="app-card-subtitle">
            ใช้แสดงในใบเสนอราคา / ใบวางบิล และใช้เป็นต้นทางการโอนสำหรับ Account Expense
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingId(null);
              setShowModal(true);
            }}
            className="app-btn app-btn-primary app-btn-sm"
          >
            + เพิ่มบัญชี
          </button>
        )}
      </div>

      {banksQuery.isLoading ? (
        <div className="app-skeleton" style={{ height: "100px" }} />
      ) : banks.length === 0 ? (
        <div className="app-empty" style={{ padding: "1.5rem 1rem" }}>
          <div className="app-empty-icon">🏦</div>
          <p className="app-empty-title">ยังไม่มีบัญชีบริษัท</p>
          <p className="app-empty-desc">
            เพิ่มบัญชีเพื่อใช้ในใบเสนอราคา ใบวางบิล และการจ่ายเงิน
          </p>
          {isAdmin && (
            <button onClick={() => setShowModal(true)} className="app-btn app-btn-primary">
              + เพิ่มบัญชีแรก
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {banks.map((b) => (
            <div
              key={b.companyBankId}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "0.625rem",
                padding: "1rem",
                background: b.isDefault ? "linear-gradient(135deg, #eff6ff, white)" : "white",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.375rem" }}>
                    <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#0f172a" }}>
                      {b.bankName}
                    </span>
                    {b.isDefault && (
                      <span className="app-badge app-badge-success">⭐ Default</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "ui-monospace",
                      fontSize: "0.875rem",
                      color: "#475569",
                      marginBottom: "0.125rem",
                    }}
                  >
                    {b.accountNumber}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                    {b.accountName}
                    {b.branch ? ` • สาขา${b.branch}` : ""}
                  </div>
                  <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    {b.useForQuotation && (
                      <span className="app-badge app-badge-info">📜 ใบเสนอราคา</span>
                    )}
                    {b.useForBilling && (
                      <span className="app-badge app-badge-info">🧾 ใบวางบิล</span>
                    )}
                    {b.useForPayment && (
                      <span className="app-badge app-badge-warning">💸 จ่ายเงิน</span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setEditingId(b.companyBankId);
                      setShowModal(true);
                    }}
                    className="app-btn app-btn-ghost app-btn-sm"
                  >
                    ✏️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CompanyBankModal
          bank={editing}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingId(null);
            utils.companyBank.list.invalidate();
          }}
        />
      )}
    </div>
  );
}

function CompanyBankModal({
  bank,
  onClose,
  onSuccess,
}: {
  bank?: {
    companyBankId: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    branch: string;
    isDefault: boolean;
    useForQuotation: boolean;
    useForBilling: boolean;
    useForPayment: boolean;
  };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!bank;
  const utils = trpc.useUtils();
  const createMut = trpc.companyBank.create.useMutation();
  const updateMut = trpc.companyBank.update.useMutation();
  const deleteMut = trpc.companyBank.delete.useMutation();
  const banksQuery = trpc.bank.list.useQuery();
  const banks = banksQuery.data || [];

  const [form, setForm] = useState({
    bankName: bank?.bankName || "",
    accountNumber: bank?.accountNumber || "",
    accountName: bank?.accountName || "",
    branch: bank?.branch || "",
    isDefault: bank?.isDefault || false,
    useForQuotation: bank?.useForQuotation !== undefined ? bank.useForQuotation : true,
    useForBilling: bank?.useForBilling !== undefined ? bank.useForBilling : true,
    useForPayment: bank?.useForPayment !== undefined ? bank.useForPayment : true,
  });
  const [error, setError] = useState<string | null>(null);
  const isLoading = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.bankName) {
      setError("กรุณาเลือกธนาคาร");
      return;
    }
    if (!form.accountNumber.trim()) {
      setError("กรุณากรอกเลขบัญชี");
      return;
    }
    if (!form.accountName.trim()) {
      setError("กรุณากรอกชื่อบัญชี");
      return;
    }
    try {
      const data = {
        bankName: form.bankName,
        accountNumber: form.accountNumber.trim(),
        accountName: form.accountName.trim(),
        branch: form.branch.trim() || undefined,
        isDefault: form.isDefault,
        useForQuotation: form.useForQuotation,
        useForBilling: form.useForBilling,
        useForPayment: form.useForPayment,
      };
      if (isEdit) {
        await updateMut.mutateAsync({ companyBankId: bank.companyBankId, ...data });
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
    if (!confirm(`ลบบัญชี ${bank.bankName} ${bank.accountNumber} ใช่หรือไม่?`)) return;
    setError(null);
    try {
      await deleteMut.mutateAsync({ companyBankId: bank.companyBankId });
      utils.companyBank.list.invalidate();
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
              {isEdit ? "แก้ไขบัญชีบริษัท" : "เพิ่มบัญชีธนาคารบริษัท"}
            </h3>
            <button type="button" onClick={onClose} className="app-btn app-btn-ghost app-btn-icon">
              ✕
            </button>
          </div>

          <div className="app-modal-body">
            {error && <div className="app-error-msg">{error}</div>}

            <div className="app-form-group">
              <label className="app-label app-label-required">ธนาคาร</label>
              <SearchableSelect
                options={banks.map((b) => ({ value: b.bankName, label: b.bankName }))}
                value={form.bankName}
                onChange={(val) => setForm({ ...form, bankName: val })}
                className="app-select"
                placeholder="เลือกธนาคาร"
                emptyLabel="— เลือกธนาคาร —"
              />
            </div>

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label app-label-required">เลขบัญชี</label>
                <input
                  type="text"
                  value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  placeholder="xxx-x-xxxxx-x"
                  className="app-input mono"
                  maxLength={50}
                />
              </div>
              <div className="app-form-group">
                <label className="app-label">สาขา</label>
                <input
                  type="text"
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  placeholder="สีลม, เซ็นทรัล, ฯลฯ"
                  className="app-input"
                  maxLength={100}
                />
              </div>
            </div>

            <div className="app-form-group">
              <label className="app-label app-label-required">ชื่อบัญชี</label>
              <input
                type="text"
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                placeholder="บริษัท ของคุณ จำกัด"
                className="app-input"
                maxLength={200}
              />
            </div>

            <div className="app-form-group">
              <label className="app-checkbox">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                />
                ตั้งเป็นบัญชีหลัก (Default)
              </label>
            </div>

            <div
              className="app-form-group"
              style={{
                background: "#f8fafc",
                padding: "1rem",
                borderRadius: "0.5rem",
                border: "1px solid #e2e8f0",
              }}
            >
              <p className="app-label" style={{ marginBottom: "0.75rem" }}>
                ใช้บัญชีนี้สำหรับ
              </p>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label className="app-checkbox">
                  <input
                    type="checkbox"
                    checked={form.useForQuotation}
                    onChange={(e) => setForm({ ...form, useForQuotation: e.target.checked })}
                  />
                  📜 แสดงในใบเสนอราคา (Quotation)
                </label>
                <label className="app-checkbox">
                  <input
                    type="checkbox"
                    checked={form.useForBilling}
                    onChange={(e) => setForm({ ...form, useForBilling: e.target.checked })}
                  />
                  🧾 แสดงในใบวางบิล (Billing Note)
                </label>
                <label className="app-checkbox">
                  <input
                    type="checkbox"
                    checked={form.useForPayment}
                    onChange={(e) => setForm({ ...form, useForPayment: e.target.checked })}
                  />
                  💸 ใช้เป็นต้นทางโอนใน Account Expense
                </label>
              </div>
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
                "เพิ่มบัญชี"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
