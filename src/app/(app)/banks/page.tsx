"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

export default function BanksPage() {
  const utils = trpc.useUtils();
  const banksQuery = trpc.bank.list.useQuery();
  const banks = banksQuery.data || [];

  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = banks.filter(
    (b) => !search || b.bankName.toLowerCase().includes(search.toLowerCase())
  );

  const customCount = banks.filter((b) => b.isCustom).length;
  const defaultCount = banks.length - customCount;

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🏦 รายชื่อธนาคาร</h1>
          <p className="app-page-subtitle">
            รายชื่อธนาคาร (ใช้เป็น dropdown ตอนเพิ่มผู้รับเงิน)
          </p>
        </div>
        <button
          className="app-btn app-btn-primary"
          onClick={() => setShowModal(true)}
        >
          + เพิ่มธนาคาร
        </button>
      </div>

      <div
        style={{
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          padding: "0.875rem 1rem",
          borderRadius: "0.5rem",
          fontSize: "0.8125rem",
          color: "#1e3a8a",
          marginBottom: "1.5rem",
        }}
      >
        💡 <strong>หมายเหตุ:</strong> ระบบมีธนาคารไทยหลักให้อยู่แล้ว {defaultCount} ธนาคาร
        ถ้าต้องการธนาคารอื่น สามารถเพิ่มเองได้ — และตอนกรอกข้อมูลผู้รับเงิน จะเลือกธนาคารจากรายการนี้
        <br />
        <strong>บัญชีธนาคาร**ของบริษัท**</strong> (สำหรับใบเสนอราคา/ใบวางบิล) →
        <a href="/settings/org" style={{ color: "#2563eb", marginLeft: "0.25rem" }}>
          ไปที่ตั้งค่าบริษัท →
        </a>
      </div>

      <div className="app-filter-row">
        <input
          type="text"
          placeholder="🔍 ค้นหาชื่อธนาคาร..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="app-input"
          style={{ minWidth: "280px" }}
        />
        <span style={{ fontSize: "0.8125rem", color: "#64748b" }}>
          {banks.length} ธนาคาร ({customCount} เพิ่มเอง)
        </span>
      </div>

      {banksQuery.isLoading ? (
        <div className="app-card">
          <div className="app-skeleton" style={{ height: "200px" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">🏦</div>
            <p className="app-empty-title">ไม่พบธนาคาร</p>
          </div>
        </div>
      ) : (
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>ชื่อธนาคาร</th>
                <th className="text-center">ประเภท</th>
                <th className="text-center" style={{ width: "100px" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.bankId}>
                  <td style={{ fontWeight: 500 }}>{b.bankName}</td>
                  <td className="text-center">
                    {b.isCustom ? (
                      <span className="app-badge app-badge-info">เพิ่มเอง</span>
                    ) : (
                      <span className="app-badge app-badge-neutral">พื้นฐาน</span>
                    )}
                  </td>
                  <td className="text-center">
                    {b.isCustom && (
                      <DeleteButton
                        bankId={b.bankId}
                        bankName={b.bankName}
                        onDeleted={() => utils.bank.list.invalidate()}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddBankModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            utils.bank.list.invalidate();
          }}
        />
      )}
    </div>
  );
}

function DeleteButton({
  bankId,
  bankName,
  onDeleted,
}: {
  bankId: string;
  bankName: string;
  onDeleted: () => void;
}) {
  const deleteMut = trpc.bank.delete.useMutation();

  const handleDelete = async () => {
    if (!confirm(`ลบธนาคาร "${bankName}" ใช่หรือไม่?`)) return;
    try {
      await deleteMut.mutateAsync({ bankId });
      onDeleted();
    } catch (e) {
      alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleteMut.isPending}
      className="app-btn app-btn-ghost app-btn-sm"
      style={{ color: "#dc2626" }}
    >
      🗑️
    </button>
  );
}

function AddBankModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const createMut = trpc.bank.create.useMutation();
  const [bankName, setBankName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!bankName.trim()) {
      setError("กรุณากรอกชื่อธนาคาร");
      return;
    }
    try {
      await createMut.mutateAsync({ bankName: bankName.trim() });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div
      className="app-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="app-modal">
        <form onSubmit={handleSubmit}>
          <div className="app-modal-header">
            <h3 className="app-modal-title">เพิ่มธนาคารใหม่</h3>
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
            <div className="app-form-group">
              <label className="app-label app-label-required">ชื่อธนาคาร</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="เช่น ธนาคารแลนด์ แอนด์ เฮ้าส์"
                className="app-input"
                maxLength={100}
                autoFocus
              />
              <p className="app-hint">
                เพิ่มธนาคารที่ไม่มีในรายการพื้นฐาน
              </p>
            </div>
          </div>
          <div className="app-modal-footer">
            <button
              type="button"
              onClick={onClose}
              disabled={createMut.isPending}
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
                "เพิ่มธนาคาร"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
