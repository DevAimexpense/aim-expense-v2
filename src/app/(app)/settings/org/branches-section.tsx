"use client";

// ===========================================
// Org settings → จัดการสาขา (additional branches of the same business)
// ===========================================

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

interface Branch {
  id: string;
  name: string;
  branchNumber: string;
  address: string;
  phone: string;
}

export function BranchesSection({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const branchesQuery = trpc.branch.list.useQuery();
  const branches = branchesQuery.data || [];

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = branches.find((b) => b.id === editingId);

  return (
    <div className="app-card">
      <div className="app-card-header">
        <div>
          <h2 className="app-card-title">🏢 สาขาของบริษัท</h2>
          <p className="app-card-subtitle">
            เพิ่มสาขาของนิติบุคคลเดียวกัน (เลขผู้เสียภาษีเดียวกัน) — นับเป็น 1
            บริษัท ไม่กินโควต้า
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
            + เพิ่มสาขา
          </button>
        )}
      </div>

      {branchesQuery.isLoading ? (
        <div className="app-skeleton" style={{ height: "80px" }} />
      ) : branches.length === 0 ? (
        <div className="app-empty" style={{ padding: "1.5rem 1rem" }}>
          <div className="app-empty-icon">🏢</div>
          <p className="app-empty-title">ยังไม่มีสาขาเพิ่มเติม</p>
          <p className="app-empty-desc">
            สำนักงานใหญ่ตั้งค่าได้ที่ &quot;ข้อมูลบริษัท&quot; ด้านบน —
            เพิ่มสาขาอื่นได้ที่นี่
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="app-btn app-btn-primary"
            >
              + เพิ่มสาขาแรก
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {branches.map((b) => (
            <div
              key={b.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "0.625rem",
                padding: "1rem",
                background: "white",
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
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.9375rem",
                        fontWeight: 600,
                        color: "#0f172a",
                      }}
                    >
                      {b.name}
                    </span>
                    <span className="app-badge app-badge-info">
                      สาขา {b.branchNumber}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                    {b.address}
                  </div>
                  {b.phone && (
                    <div
                      style={{
                        fontSize: "0.8125rem",
                        color: "#64748b",
                        marginTop: "0.125rem",
                      }}
                    >
                      โทร: {b.phone}
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setEditingId(b.id);
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
        <BranchModal
          branch={editing}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingId(null);
            utils.branch.list.invalidate();
          }}
        />
      )}
    </div>
  );
}

function BranchModal({
  branch,
  onClose,
  onSuccess,
}: {
  branch?: Branch;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!branch;
  const utils = trpc.useUtils();
  const createMut = trpc.branch.create.useMutation();
  const updateMut = trpc.branch.update.useMutation();
  const deleteMut = trpc.branch.delete.useMutation();

  const [form, setForm] = useState({
    name: branch?.name || "",
    branchNumber: branch?.branchNumber || "",
    address: branch?.address || "",
    phone: branch?.phone || "",
  });
  const [error, setError] = useState<string | null>(null);
  const isLoading =
    createMut.isPending || updateMut.isPending || deleteMut.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("กรุณากรอกชื่อสาขา");
      return;
    }
    if (!/^\d{5}$/.test(form.branchNumber)) {
      setError("เลขสาขาต้องเป็นตัวเลข 5 หลัก");
      return;
    }
    if (!form.address.trim()) {
      setError("กรุณากรอกที่อยู่สาขา");
      return;
    }
    try {
      const data = {
        name: form.name.trim(),
        branchNumber: form.branchNumber,
        address: form.address.trim(),
        phone: form.phone.trim() || undefined,
      };
      if (isEdit) {
        await updateMut.mutateAsync({ id: branch.id, ...data });
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
    if (!confirm(`ลบสาขา ${branch.name} ใช่หรือไม่?`)) return;
    setError(null);
    try {
      await deleteMut.mutateAsync({ id: branch.id });
      utils.branch.list.invalidate();
      onClose();
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
            <h3 className="app-modal-title">
              {isEdit ? "แก้ไขสาขา" : "เพิ่มสาขา"}
            </h3>
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

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label app-label-required">
                  ชื่อสาขา
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="สาขาลาดพร้าว"
                  className="app-input"
                  maxLength={200}
                />
              </div>
              <div className="app-form-group">
                <label className="app-label app-label-required">
                  เลขสาขา (5 หลัก)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.branchNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      branchNumber: e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 5),
                    })
                  }
                  placeholder="00001"
                  className="app-input mono"
                  maxLength={5}
                />
              </div>
            </div>

            <div className="app-form-group">
              <label className="app-label app-label-required">
                ที่อยู่สาขา
              </label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
                className="app-textarea"
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="app-form-group">
              <label className="app-label">เบอร์โทรสาขา</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="02-xxx-xxxx"
                className="app-input"
                maxLength={30}
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
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="app-btn app-btn-secondary"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="app-btn app-btn-primary"
            >
              {isLoading ? (
                <>
                  <span className="app-spinner" /> กำลังบันทึก...
                </>
              ) : isEdit ? (
                "บันทึก"
              ) : (
                "เพิ่มสาขา"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
