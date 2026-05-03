"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

type CustomerListItem =
  inferRouterOutputs<AppRouter>["customer"]["list"][number];

const PAYMENT_TERMS_DEFAULTS = ["NET 0", "NET 15", "NET 30", "NET 60", "NET 90"];

export function CustomersClient({
  initialCustomers,
}: {
  initialCustomers: CustomerListItem[];
}) {
  const utils = trpc.useUtils();
  const customersQuery = trpc.customer.list.useQuery(undefined, {
    initialData: initialCustomers,
  });
  const customers = customersQuery.data || [];

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = customers.filter(
    (c) =>
      !search ||
      c.customerName.toLowerCase().includes(search.toLowerCase()) ||
      c.taxId.includes(search) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  const editingCustomer = customers.find((c) => c.customerId === editingId);

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🏢 ลูกค้า</h1>
          <p className="app-page-subtitle">
            จัดการข้อมูลลูกค้า ที่ใช้ออกใบเสนอราคา / ใบวางบิล / ใบกำกับภาษี
          </p>
        </div>
        <button
          className="app-btn app-btn-primary"
          onClick={() => {
            setEditingId(null);
            setShowModal(true);
          }}
        >
          + เพิ่มลูกค้า
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

      {customersQuery.isLoading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">🏢</div>
            <p className="app-empty-title">
              {customers.length === 0 ? "ยังไม่มีลูกค้า" : "ไม่พบลูกค้า"}
            </p>
            <p className="app-empty-desc">
              {customers.length === 0
                ? "เพิ่มข้อมูลลูกค้าเพื่อใช้ตอนสร้างใบเสนอราคา"
                : "ลองเปลี่ยนคำค้นหา"}
            </p>
            {customers.length === 0 && (
              <button
                onClick={() => setShowModal(true)}
                className="app-btn app-btn-primary"
              >
                + เพิ่มลูกค้าคนแรก
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
                <th>สาขา</th>
                <th className="text-center">VAT</th>
                <th>เครดิต</th>
                <th className="text-right">WHT%</th>
                <th>ติดต่อ</th>
                <th className="text-center"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.customerId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.customerName}</div>
                    {c.contactPerson && (
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {c.contactPerson}
                      </div>
                    )}
                  </td>
                  <td className="num" style={{ fontFamily: "ui-monospace" }}>
                    {c.taxId || "-"}
                  </td>
                  <td>
                    {c.branchType === "Branch"
                      ? `สาขา ${c.branchNumber}`
                      : "สำนักงานใหญ่"}
                  </td>
                  <td className="text-center">
                    {c.isVAT ? (
                      <span className="app-badge app-badge-info">VAT</span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>-</span>
                    )}
                  </td>
                  <td>{c.paymentTerms}</td>
                  <td className="text-right num">
                    {c.defaultWHTPercent > 0 ? `${c.defaultWHTPercent}%` : "-"}
                  </td>
                  <td>
                    {c.phone && (
                      <div style={{ fontSize: "0.75rem" }}>📞 {c.phone}</div>
                    )}
                    {c.email && (
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        ✉️ {c.email}
                      </div>
                    )}
                    {!c.phone && !c.email && "-"}
                  </td>
                  <td className="text-center">
                    <button
                      className="app-btn app-btn-ghost app-btn-sm"
                      onClick={() => {
                        setEditingId(c.customerId);
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
        <CustomerModal
          customer={editingCustomer}
          onClose={() => {
            setShowModal(false);
            setEditingId(null);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingId(null);
            utils.customer.list.invalidate();
          }}
        />
      )}
    </div>
  );
}

interface CustomerForm {
  customerName: string;
  taxId: string;
  branchType: "HQ" | "Branch";
  branchNumber: string;
  isVAT: boolean;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  billingAddress: string;
  paymentTerms: string;
  defaultWHTPercent: number;
  notes: string;
}

function CustomerModal({
  customer,
  onClose,
  onSuccess,
}: {
  customer?: {
    customerId: string;
    customerName: string;
    taxId: string;
    branchType: "HQ" | "Branch";
    branchNumber: string;
    isVAT: boolean;
    contactPerson: string;
    phone: string;
    email: string;
    address: string;
    billingAddress: string;
    paymentTerms: string;
    defaultWHTPercent: number;
    notes: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!customer;
  const utils = trpc.useUtils();
  const createMut = trpc.customer.create.useMutation();
  const updateMut = trpc.customer.update.useMutation();
  const deleteMut = trpc.customer.delete.useMutation();

  const [form, setForm] = useState<CustomerForm>({
    customerName: customer?.customerName || "",
    taxId: customer?.taxId || "",
    branchType: customer?.branchType || "HQ",
    branchNumber: customer?.branchNumber || "",
    isVAT: customer?.isVAT || false,
    contactPerson: customer?.contactPerson || "",
    phone: customer?.phone || "",
    email: customer?.email || "",
    address: customer?.address || "",
    billingAddress: customer?.billingAddress || "",
    paymentTerms: customer?.paymentTerms || "NET 30",
    defaultWHTPercent: customer?.defaultWHTPercent || 0,
    notes: customer?.notes || "",
  });
  const [error, setError] = useState<string | null>(null);
  const isLoading =
    createMut.isPending || updateMut.isPending || deleteMut.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.customerName.trim()) {
      setError("กรุณากรอกชื่อลูกค้า");
      return;
    }
    try {
      const data = {
        customerName: form.customerName.trim(),
        taxId: form.taxId.trim() || undefined,
        branchType: form.branchType,
        branchNumber:
          form.branchType === "Branch"
            ? form.branchNumber.trim() || undefined
            : undefined,
        isVAT: form.isVAT,
        contactPerson: form.contactPerson.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        billingAddress: form.billingAddress.trim() || undefined,
        paymentTerms: form.paymentTerms.trim() || "NET 30",
        defaultWHTPercent: form.defaultWHTPercent,
        notes: form.notes.trim() || undefined,
      };
      if (isEdit) {
        await updateMut.mutateAsync({ customerId: customer.customerId, ...data });
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
    if (!confirm(`ลบ "${customer.customerName}" ใช่หรือไม่?`)) return;
    setError(null);
    try {
      await deleteMut.mutateAsync({ customerId: customer.customerId });
      utils.customer.list.invalidate();
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
              {isEdit ? "แก้ไขลูกค้า" : "เพิ่มลูกค้าใหม่"}
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

            <div className="app-form-group">
              <label className="app-label app-label-required">ชื่อลูกค้า</label>
              <input
                type="text"
                value={form.customerName}
                onChange={(e) =>
                  setForm({ ...form, customerName: e.target.value })
                }
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
                    setForm({
                      ...form,
                      taxId: e.target.value.replace(/\D/g, "").slice(0, 13),
                    })
                  }
                  placeholder="13 หลัก"
                  className="app-input mono"
                  maxLength={13}
                />
              </div>
              <div className="app-form-group">
                <label className="app-label">ผู้ติดต่อ</label>
                <input
                  type="text"
                  value={form.contactPerson}
                  onChange={(e) =>
                    setForm({ ...form, contactPerson: e.target.value })
                  }
                  placeholder="ชื่อผู้ติดต่อ"
                  className="app-input"
                  maxLength={100}
                />
              </div>
            </div>

            {/* Branch */}
            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label">ประเภทสำนักงาน</label>
                <select
                  value={form.branchType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      branchType: e.target.value as "HQ" | "Branch",
                    })
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
                      setForm({
                        ...form,
                        branchNumber: e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 5),
                      })
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
                <label className="app-label">เครดิต (Payment Terms)</label>
                <input
                  type="text"
                  value={form.paymentTerms}
                  onChange={(e) =>
                    setForm({ ...form, paymentTerms: e.target.value })
                  }
                  list="payment-terms-defaults"
                  className="app-input"
                  maxLength={50}
                  placeholder="NET 30"
                />
                <datalist id="payment-terms-defaults">
                  {PAYMENT_TERMS_DEFAULTS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div className="app-form-group">
                <label className="app-label">% หัก ณ ที่จ่าย (default)</label>
                <input
                  type="number"
                  value={form.defaultWHTPercent}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultWHTPercent: parseFloat(e.target.value) || 0,
                    })
                  }
                  min={0}
                  max={15}
                  step={0.5}
                  placeholder="เช่น 3 (freelance), 1 (บริษัท)"
                  className="app-input num"
                />
                <p className="app-hint">
                  ลูกค้าหัก ณ ที่จ่ายเรากี่ % — auto-fill ใน billing
                </p>
              </div>
            </div>

            <div className="app-form-group">
              <label className="app-checkbox">
                <input
                  type="checkbox"
                  checked={form.isVAT}
                  onChange={(e) =>
                    setForm({ ...form, isVAT: e.target.checked })
                  }
                />
                ลูกค้าจดทะเบียน VAT
              </label>
              <p className="app-hint">
                info-only — ไม่กระทบการออก tax invoice (ออกให้ใครก็ได้)
              </p>
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
                  maxLength={20}
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
              <label className="app-label">ที่อยู่ตามทะเบียน</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="ที่อยู่สำหรับออก tax invoice"
                className="app-textarea"
                rows={2}
                maxLength={500}
              />
            </div>

            <div className="app-form-group">
              <label className="app-label">
                ที่อยู่จัดส่งใบวางบิล (ถ้าต่างจากทะเบียน)
              </label>
              <textarea
                value={form.billingAddress}
                onChange={(e) =>
                  setForm({ ...form, billingAddress: e.target.value })
                }
                placeholder="default = ที่อยู่ตามทะเบียน"
                className="app-textarea"
                rows={2}
                maxLength={500}
              />
            </div>

            <div className="app-form-group">
              <label className="app-label">หมายเหตุ</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
                "เพิ่มลูกค้า"
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
