"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { calculatePayment } from "@/lib/calculations";
import { WTH_TYPES, findWthTypeByRate } from "@/lib/wth-types";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";
import {
  EXPENSE_CATEGORIES_MAIN,
  DOCUMENT_TYPE_OPTIONS,
  EXPENSE_NATURE_OPTIONS,
} from "@/lib/constants/expense-categories";

interface Event {
  eventId: string;
  eventName: string;
  status: string;
}

interface Payee {
  payeeId: string;
  payeeName: string;
  isVAT: boolean;
  defaultWTH: number;
  bankName: string;
  bankAccount: string;
}

interface PaymentData {
  paymentId: string;
  eventId: string;
  payeeId: string;
  expenseType: "team" | "account";
  companyBankId: string;
  invoiceNumber: string;
  invoiceFileUrl: string;
  description: string;
  costPerUnit: number;
  days: number;
  numberOfPeople: number;
  ttlAmount: number;
  pctWTH: number;
  wthAmount: number;
  vatAmount: number;
  gttlAmount: number;
  status: string;
  paymentDate: string;
  dueDate: string;
  notes: string;
  receiptUrl: string;
  // R5/R6: tax compliance fields
  documentType?: string;
  expenseNature?: string;
  categoryMain?: string;
  categorySub?: string;
  requesterName?: string;
  vendorTaxIdSnapshot?: string;
  vendorBranchInfo?: string;
  createdBy?: string;
  createdByUserId?: string;
}

export function PaymentModal({
  payment,
  events,
  payees,
  onClose,
  onSuccess,
}: {
  payment?: PaymentData;
  events: Event[];
  payees: Payee[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!payment;
  const utils = trpc.useUtils();
  const meQuery = trpc.org.me.useQuery();
  const canEditAfterApproval =
    meQuery.data?.permissions?.editPaymentAfterApproval ?? false;
  const myUserId = meQuery.data?.userId || "";
  const myRole = meQuery.data?.role || "";
  const myDisplayName = meQuery.data?.displayName || "";
  const isAdminOrManager = myRole === "admin" || myRole === "manager";
  const isPostApproval =
    isEdit && payment.status !== "pending" && payment.status !== "rejected";
  // R6 ownership rule: ถ้าไม่ใช่ admin/manager และไม่ใช่เจ้าของ → readonly
  const isOwner =
    isEdit && !!payment.createdByUserId && payment.createdByUserId === myUserId;
  const noOwnershipPermission = isEdit && !isAdminOrManager && !isOwner;
  // Read-only ถ้า:
  //  - รายการถูกอนุมัติแล้ว และ user ไม่มีสิทธิ์ editPaymentAfterApproval
  //  - หรือไม่ใช่เจ้าของรายการ และไม่ใช่ admin/manager
  const isReadOnly =
    (isPostApproval && !canEditAfterApproval) || noOwnershipPermission;
  const createMut = trpc.payment.create.useMutation();
  const updateMut = trpc.payment.update.useMutation();
  const deleteMut = trpc.payment.delete.useMutation();
  const createPayeeMut = trpc.payee.create.useMutation();
  const companyBanksQuery = trpc.companyBank.listForPayment.useQuery();
  const masterBanksQuery = trpc.bank.list.useQuery();
  const companyBanks = companyBanksQuery.data || [];
  const masterBanks = masterBanksQuery.data || [];

  // ===== Inline "เพิ่ม Payee ใหม่" state =====
  const [showNewPayee, setShowNewPayee] = useState(false);
  const [newPayee, setNewPayee] = useState({
    payeeName: "",
    taxId: "",
    branchType: "HQ" as "HQ" | "Branch",
    branchNumber: "",
    bankName: "",
    bankAccount: "",
    isVAT: false,
    defaultWTH: 0,
    phone: "",
    email: "",
    address: "",
  });
  const [newPayeeError, setNewPayeeError] = useState<string | null>(null);

  const resetNewPayee = () => {
    setNewPayee({
      payeeName: "", taxId: "", branchType: "HQ", branchNumber: "",
      bankName: "", bankAccount: "", isVAT: false, defaultWTH: 0,
      phone: "", email: "", address: "",
    });
    setNewPayeeError(null);
  };

  const handleCreateNewPayee = async () => {
    setNewPayeeError(null);
    if (!newPayee.payeeName.trim()) {
      setNewPayeeError("กรุณากรอกชื่อผู้รับเงิน");
      return;
    }
    if (newPayee.taxId && newPayee.taxId.length !== 13) {
      setNewPayeeError("เลขผู้เสียภาษีต้องครบ 13 หลัก");
      return;
    }
    try {
      const result = await createPayeeMut.mutateAsync({
        payeeName: newPayee.payeeName.trim(),
        taxId: newPayee.taxId.trim() || undefined,
        branchType: newPayee.branchType,
        branchNumber: newPayee.branchNumber.trim() || undefined,
        bankName: newPayee.bankName.trim() || undefined,
        bankAccount: newPayee.bankAccount.trim() || undefined,
        isVAT: newPayee.isVAT,
        defaultWTH: newPayee.defaultWTH,
        phone: newPayee.phone.trim() || undefined,
        email: newPayee.email.trim() || undefined,
        address: newPayee.address.trim() || undefined,
      });
      // Refresh payees list + auto-select the new payee
      await utils.payee.list.invalidate();
      setForm((prev) => ({
        ...prev,
        payeeId: result.payeeId,
        // Auto-fill VAT/WTH จาก new payee
        isVatPayee: newPayee.isVAT,
        wthTypeId: (findWthTypeByRate(newPayee.defaultWTH)?.id) ?? (newPayee.defaultWTH > 0 ? "custom" : "none"),
        customWthRate: newPayee.defaultWTH,
      }));
      setShowNewPayee(false);
      resetNewPayee();
    } catch (e) {
      setNewPayeeError(e instanceof Error ? e.message : "เพิ่ม Payee ไม่สำเร็จ");
    }
  };

  // หา WTH type เริ่มต้นจาก rate ของ payment ที่มีอยู่ (กรณี edit)
  // ถ้าหา match ไม่ได้ → fallback เป็น "custom" พร้อม rate จริง
  const initialWthMatch = payment ? findWthTypeByRate(payment.pctWTH) : undefined;
  const initialWthTypeId =
    initialWthMatch?.id ?? (payment && payment.pctWTH > 0 ? "custom" : "none");

  const [form, setForm] = useState({
    eventId: payment?.eventId || "",
    payeeId: payment?.payeeId || "",
    expenseType: payment?.expenseType || ("account" as "team" | "account"),
    companyBankId: payment?.companyBankId || "",
    invoiceNumber: payment?.invoiceNumber || "",
    description: payment?.description || "",
    costPerUnit: payment?.costPerUnit || 0,
    days: payment?.days || 1,
    numberOfPeople: payment?.numberOfPeople || 1,
    wthTypeId: initialWthTypeId,
    customWthRate: payment?.pctWTH || 0,
    isVatPayee: payment ? payment.vatAmount > 0 : false,
    dueDate: payment?.dueDate || addDaysISO(7),
    notes: payment?.notes || "",
    // R5/R6: tax compliance fields
    documentType: (payment?.documentType || "") as "" | "receipt" | "tax_invoice",
    expenseNature: (payment?.expenseNature || "") as "" | "goods" | "service",
    categoryMain: payment?.categoryMain || "",
    categorySub: payment?.categorySub || "",
    requesterName: payment?.requesterName || "",
  });

  // Default RequesterName = ชื่อ user ปัจจุบัน (ตอน create) — ใช้ effect ซ้อนตรง ๆ
  useEffect(() => {
    if (!isEdit && !form.requesterName && myDisplayName) {
      setForm((prev) => ({ ...prev, requesterName: myDisplayName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDisplayName]);

  // อัตรา % หัก ณ ที่จ่ายจริงที่จะใช้คำนวณ + บันทึก
  const selectedWth = WTH_TYPES.find((t) => t.id === form.wthTypeId) || WTH_TYPES[0];
  const effectiveWthRate =
    form.wthTypeId === "custom" ? form.customWthRate : selectedWth.rate;
  const [error, setError] = useState<string | null>(null);
  // invoiceFile upload removed — receipts are uploaded in บันทึกค่าใช้จ่าย only
  const [uploading, setUploading] = useState(false);

  // Auto-fill when Payee changes
  const selectedPayee = payees.find((p) => p.payeeId === form.payeeId);
  useEffect(() => {
    if (!selectedPayee) return;
    if (isEdit) return; // don't override when editing
    // หา WTH type ที่ rate ตรงกับ defaultWTH ของ payee — ถ้าหาไม่เจอ fallback เป็น custom
    const wthMatch = findWthTypeByRate(selectedPayee.defaultWTH);
    setForm((prev) => ({
      ...prev,
      isVatPayee: selectedPayee.isVAT,
      wthTypeId: wthMatch?.id ?? (selectedPayee.defaultWTH > 0 ? "custom" : "none"),
      customWthRate: selectedPayee.defaultWTH,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.payeeId]);

  // Auto-select default bank for account expense
  useEffect(() => {
    if (form.expenseType !== "account" || form.companyBankId) return;
    const defaultBank = companyBanks.find((b) => b.isDefault);
    if (defaultBank) {
      setForm((prev) => ({ ...prev, companyBankId: defaultBank.companyBankId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyBanks.length, form.expenseType]);

  // Filter active events
  const activeEvents = useMemo(
    () => events.filter((e) => e.status !== "cancelled"),
    [events]
  );

  // Live calculation
  const calc = useMemo(
    () =>
      calculatePayment({
        costPerUnit: form.costPerUnit,
        days: form.days,
        numberOfPeople: form.numberOfPeople,
        pctWTH: effectiveWthRate,
        isVatPayee: form.isVatPayee,
      }),
    [
      form.costPerUnit,
      form.days,
      form.numberOfPeople,
      effectiveWthRate,
      form.isVatPayee,
    ]
  );

  const isLoading = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  const validate = (): string | null => {
    if (!form.eventId) return "กรุณาเลือกโปรเจกต์";
    if (!form.payeeId) return "กรุณาเลือกผู้รับเงิน";
    if (!form.description.trim()) return "กรุณากรอกรายละเอียด";
    if (form.costPerUnit < 0) return "ค่าใช้จ่ายต้องไม่ติดลบ";
    if (form.days < 1) return "จำนวนวันต้องอย่างน้อย 1";
    if (form.numberOfPeople < 1) return "จำนวนคนต้องอย่างน้อย 1";
    if (form.wthTypeId === "custom" && (form.customWthRate < 0 || form.customWthRate > 100))
      return "อัตราหัก ณ ที่จ่ายต้องอยู่ระหว่าง 0-100%";
    if (!form.dueDate) return "กรุณาเลือกวันครบกำหนด";
    if (form.expenseType === "account" && !form.companyBankId)
      return "Account Expense ต้องเลือกบัญชีต้นทาง";
    return null;
  };

  const validateFile = (file: File): string | null => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(file.type)) return "รองรับเฉพาะ jpg, png, pdf";
    if (file.size > 10 * 1024 * 1024) return "ไฟล์ใหญ่เกิน 10 MB";
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
    try {
      const data = {
        eventId: form.eventId,
        payeeId: form.payeeId,
        expenseType: form.expenseType,
        companyBankId: form.companyBankId || undefined,
        invoiceNumber: form.invoiceNumber.trim() || undefined,
        description: form.description.trim(),
        costPerUnit: form.costPerUnit,
        days: form.days,
        numberOfPeople: form.numberOfPeople,
        pctWTH: effectiveWthRate,
        isVatPayee: form.isVatPayee,
        dueDate: form.dueDate,
        notes: form.notes.trim() || undefined,
        // R5/R6: tax compliance fields
        documentType: form.documentType || undefined,
        expenseNature: form.expenseNature || undefined,
        categoryMain: form.categoryMain.trim() || undefined,
        categorySub: form.categorySub.trim() || undefined,
        requesterName: form.requesterName.trim() || undefined,
      };

      let paymentId: string;
      if (isEdit) {
        await updateMut.mutateAsync({ paymentId: payment.paymentId, ...data });
        paymentId = payment.paymentId;
      } else {
        const result = await createMut.mutateAsync(data);
        paymentId = result.paymentId;
      }

      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!confirm(`ลบรายการจ่ายนี้ใช่หรือไม่?`)) return;
    try {
      await deleteMut.mutateAsync({ paymentId: payment.paymentId });
      utils.payment.list.invalidate();
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
      <div className="app-modal modal-xl">
        <form onSubmit={handleSubmit}>
          <div className="app-modal-header">
            <h3 className="app-modal-title">
              {isReadOnly ? "👁 ดูรายการจ่าย" : isEdit ? "✏️ แก้ไขรายการจ่าย" : "➕ สร้างรายการจ่าย"}
              {isEdit && (
                <span style={{ fontSize: "0.75rem", color: "#94a3b8", marginLeft: "0.5rem" }}>
                  ({payment.status === "pending" ? "รอตรวจ" :
                    payment.status === "approved" ? "อนุมัติแล้ว" :
                    payment.status === "paid" ? "จ่ายแล้ว" :
                    payment.status === "rejected" ? "ปฏิเสธ" : "เคลียร์แล้ว"})
                </span>
              )}
              {isPostApproval && canEditAfterApproval && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    background: "#fef3c7",
                    color: "#854d0e",
                    padding: "0.125rem 0.5rem",
                    borderRadius: "0.375rem",
                    marginLeft: "0.5rem",
                    fontWeight: 600,
                  }}
                  title="คุณมีสิทธิ์แก้ไขหลังอนุมัติ — โปรดใช้ความระมัดระวัง"
                >
                  🔓 แก้หลังอนุมัติ
                </span>
              )}
              {noOwnershipPermission && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    background: "#fee2e2",
                    color: "#991b1b",
                    padding: "0.125rem 0.5rem",
                    borderRadius: "0.375rem",
                    marginLeft: "0.5rem",
                    fontWeight: 600,
                  }}
                  title={`สร้างโดย ${payment?.createdBy || "ผู้อื่น"} — เฉพาะ Admin/Manager เท่านั้นที่แก้ไขได้`}
                >
                  🔒 ดูอย่างเดียว
                </span>
              )}
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

            {/* Event + Payee */}
            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label app-label-required">โปรเจกต์</label>
                <SearchableSelect
                  options={activeEvents.map((e) => ({
                    value: e.eventId,
                    label: e.eventName,
                  }))}
                  value={form.eventId}
                  onChange={(val) => setForm({ ...form, eventId: val })}
                  className="app-select"
                  disabled={isReadOnly}
                  emptyLabel="— เลือกโปรเจกต์ —"
                />
              </div>

              <div className="app-form-group">
                <label className="app-label app-label-required">ผู้รับเงิน</label>
                {showNewPayee ? (
                  <div style={{
                    padding: "0.75rem",
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    borderRadius: "0.5rem",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontWeight: 600, color: "#9a3412", fontSize: "0.8125rem" }}>✨ เพิ่ม Payee ใหม่</span>
                      <button
                        type="button"
                        onClick={() => { setShowNewPayee(false); resetNewPayee(); }}
                        className="app-btn app-btn-ghost app-btn-sm"
                        style={{ fontSize: "0.7rem" }}
                      >
                        ← เลือกจากรายการ
                      </button>
                    </div>
                    {newPayeeError && (
                      <div className="app-error-msg" style={{ marginBottom: "0.5rem", fontSize: "0.75rem" }}>{newPayeeError}</div>
                    )}
                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      <input
                        type="text"
                        value={newPayee.payeeName}
                        onChange={(e) => setNewPayee({ ...newPayee, payeeName: e.target.value })}
                        placeholder="ชื่อบริษัท / บุคคล *"
                        className="app-input"
                      />
                      <div className="app-form-grid cols-2" style={{ gap: "0.5rem" }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={newPayee.taxId}
                          onChange={(e) => setNewPayee({ ...newPayee, taxId: e.target.value.replace(/\D/g, "").slice(0, 13) })}
                          placeholder="เลขผู้เสียภาษี (13 หลัก)"
                          className="app-input mono"
                          maxLength={13}
                        />
                        <div style={{ display: "flex", gap: "0.375rem" }}>
                          <SearchableSelect
                            value={newPayee.branchType}
                            onChange={(val) => setNewPayee({ ...newPayee, branchType: val as "HQ" | "Branch" })}
                            className="app-select"
                            style={{ flex: 1 }}
                            options={[
                              { value: "HQ", label: "สำนักงานใหญ่" },
                              { value: "Branch", label: "สาขา" },
                            ]}
                          />
                          {newPayee.branchType === "Branch" && (
                            <input
                              type="text"
                              value={newPayee.branchNumber}
                              onChange={(e) => setNewPayee({ ...newPayee, branchNumber: e.target.value })}
                              placeholder="เลขสาขา"
                              className="app-input mono"
                              style={{ width: "6rem" }}
                              maxLength={10}
                            />
                          )}
                        </div>
                      </div>
                      <div className="app-form-grid cols-2" style={{ gap: "0.5rem" }}>
                        <SearchableSelect
                          value={newPayee.bankName}
                          onChange={(val) => setNewPayee({ ...newPayee, bankName: val, bankAccount: val === "เงินสด" ? "" : newPayee.bankAccount })}
                          className="app-select"
                          options={[{ value: "เงินสด", label: "💵 เงินสด" }, ...masterBanks.map((b) => ({ value: b.bankName, label: b.bankName }))]}
                          emptyLabel="— ธนาคาร —"
                        />
                        {newPayee.bankName !== "เงินสด" && (
                          <input
                            type="text"
                            value={newPayee.bankAccount}
                            onChange={(e) => setNewPayee({ ...newPayee, bankAccount: e.target.value })}
                            placeholder="เลขบัญชี"
                            className="app-input mono"
                          />
                        )}
                      </div>
                      <div className="app-form-grid cols-2" style={{ gap: "0.5rem", alignItems: "center" }}>
                        <label className="app-checkbox" style={{ fontSize: "0.8125rem" }}>
                          <input
                            type="checkbox"
                            checked={newPayee.isVAT}
                            onChange={(e) => setNewPayee({ ...newPayee, isVAT: e.target.checked })}
                          />
                          <span>ผู้รับเงินเป็น VAT (จด VAT 7%)</span>
                        </label>
                        <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>WHT % ตั้งต้น</span>
                          <input
                            type="number"
                            value={newPayee.defaultWTH}
                            onChange={(e) => setNewPayee({ ...newPayee, defaultWTH: parseFloat(e.target.value) || 0 })}
                            min={0}
                            max={100}
                            step={0.5}
                            className="app-input num"
                            style={{ width: "5rem" }}
                          />
                        </div>
                      </div>
                      <div className="app-form-grid cols-2" style={{ gap: "0.5rem" }}>
                        <input
                          type="text"
                          value={newPayee.phone}
                          onChange={(e) => setNewPayee({ ...newPayee, phone: e.target.value })}
                          placeholder="เบอร์โทร (ถ้ามี)"
                          className="app-input"
                        />
                        <input
                          type="email"
                          value={newPayee.email}
                          onChange={(e) => setNewPayee({ ...newPayee, email: e.target.value })}
                          placeholder="อีเมล (ถ้ามี)"
                          className="app-input"
                        />
                      </div>
                      <textarea
                        value={newPayee.address}
                        onChange={(e) => setNewPayee({ ...newPayee, address: e.target.value })}
                        placeholder="ที่อยู่ (ถ้ามี)"
                        rows={2}
                        className="app-textarea"
                      />
                      <button
                        type="button"
                        onClick={handleCreateNewPayee}
                        disabled={createPayeeMut.isPending || !newPayee.payeeName.trim()}
                        className="app-btn app-btn-primary app-btn-sm"
                        style={{ alignSelf: "flex-end" }}
                      >
                        {createPayeeMut.isPending ? (
                          <><span className="app-spinner" /> กำลังบันทึก...</>
                        ) : (
                          "💾 บันทึก Payee"
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <SearchableSelect
                        options={payees.map((p) => ({
                          value: p.payeeId,
                          label: `${p.payeeName}${p.isVAT ? " (VAT)" : ""}`,
                        }))}
                        value={form.payeeId}
                        onChange={(val) => setForm({ ...form, payeeId: val })}
                        className="app-select"
                        style={{ flex: 1 }}
                        disabled={isReadOnly}
                        emptyLabel="— เลือกผู้รับเงิน —"
                      />
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => setShowNewPayee(true)}
                          className="app-btn app-btn-secondary app-btn-sm"
                          title="เพิ่ม Payee ใหม่"
                        >
                          + ใหม่
                        </button>
                      )}
                    </div>
                    {selectedPayee && selectedPayee.bankName && (
                      <p className="app-hint">
                        🏦 {selectedPayee.bankName}
                        {selectedPayee.bankAccount ? ` — ${selectedPayee.bankAccount}` : ""}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="app-form-group">
              <label className="app-label app-label-required">รายละเอียด</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="เช่น ค่าดอกไม้, ค่าอาหาร, ค่าวิทยากร..."
                className="app-input"
                maxLength={500}
                disabled={isReadOnly}
              />
            </div>

            {/* Expense Type */}
            <div className="app-form-group">
              <label className="app-label app-label-required">ประเภทรายจ่าย</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => !isReadOnly && setForm({ ...form, expenseType: "account" })}
                  className={`app-btn ${form.expenseType === "account" ? "app-btn-primary" : "app-btn-secondary"}`}
                  style={{ flex: 1, opacity: isReadOnly ? 0.6 : 1 }}
                  disabled={isReadOnly}
                >
                  🏦 โอนบัญชี
                </button>
                <button
                  type="button"
                  onClick={() => !isReadOnly && setForm({ ...form, expenseType: "team", companyBankId: "" })}
                  className={`app-btn ${form.expenseType === "team" ? "app-btn-primary" : "app-btn-secondary"}`}
                  style={{ flex: 1, opacity: isReadOnly ? 0.6 : 1 }}
                  disabled={isReadOnly}
                >
                  💵 เบิกเงินสด
                </button>
              </div>
            </div>

            {/* Bank Source (for account expense) */}
            {form.expenseType === "account" && (
              <div className="app-form-group">
                <label className="app-label app-label-required">บัญชีต้นทาง</label>
                {companyBanks.length === 0 ? (
                  <div
                    style={{
                      background: "#fef3c7",
                      border: "1px solid #fde68a",
                      padding: "0.75rem",
                      borderRadius: "0.5rem",
                      fontSize: "0.8125rem",
                      color: "#854d0e",
                    }}
                  >
                    ⚠️ ยังไม่มีบัญชีบริษัท —{" "}
                    <a
                      href="/settings/org"
                      target="_blank"
                      style={{ textDecoration: "underline", fontWeight: 600 }}
                    >
                      ไปเพิ่มบัญชี
                    </a>
                  </div>
                ) : (
                  <SearchableSelect
                    options={companyBanks.map((b) => ({
                      value: b.companyBankId,
                      label: `${b.bankName} ${b.accountNumber}${b.isDefault ? " ⭐" : ""}`,
                    }))}
                    value={form.companyBankId}
                    onChange={(val) =>
                      setForm({ ...form, companyBankId: val })
                    }
                    className="app-select"
                    disabled={isReadOnly}
                    emptyLabel="— เลือกบัญชีต้นทาง —"
                  />
                )}
              </div>
            )}

            {/* Calculation fields */}
            <div
              style={{
                background: "#f8fafc",
                padding: "1rem",
                borderRadius: "0.75rem",
                border: "1px solid #e2e8f0",
                marginBottom: "1rem",
              }}
            >
              <p
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "#334155",
                  margin: "0 0 0.75rem 0",
                }}
              >
                💰 คำนวณเงิน
              </p>
              <div className="app-form-grid cols-3">
                <div className="app-form-group" style={{ marginBottom: 0 }}>
                  <label className="app-label">ค่าต่อหน่วย</label>
                  <input
                    type="number"
                    value={form.costPerUnit}
                    onChange={(e) =>
                      setForm({ ...form, costPerUnit: parseFloat(e.target.value) || 0 })
                    }
                    min={0}
                    step={1}
                    className="app-input num"
                    disabled={isReadOnly}
                  />
                </div>
                <div className="app-form-group" style={{ marginBottom: 0 }}>
                  <label className="app-label">จำนวนวัน</label>
                  <input
                    type="number"
                    value={form.days}
                    onChange={(e) =>
                      setForm({ ...form, days: parseInt(e.target.value, 10) || 1 })
                    }
                    min={1}
                    className="app-input num"
                    disabled={isReadOnly}
                  />
                </div>
                <div className="app-form-group" style={{ marginBottom: 0 }}>
                  <label className="app-label">จำนวนคน/หน่วย</label>
                  <input
                    type="number"
                    value={form.numberOfPeople}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        numberOfPeople: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    min={1}
                    className="app-input num"
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              <div className="app-form-grid cols-2" style={{ marginTop: "0.75rem" }}>
                <div className="app-form-group" style={{ marginBottom: 0 }}>
                  <label className="app-label">ประเภทการหัก ณ ที่จ่าย</label>
                  <SearchableSelect
                    options={WTH_TYPES.map((t) => ({
                      value: t.id,
                      label: t.label,
                    }))}
                    value={form.wthTypeId}
                    onChange={(val) => setForm({ ...form, wthTypeId: val })}
                    className="app-select"
                    disabled={isReadOnly}
                  />
                  {selectedWth.id !== "none" && selectedWth.id !== "custom" && (
                    <p className="app-hint">
                      📋 ภ.ง.ด. {selectedWth.form === "both" ? "3 / 53" : selectedWth.form}
                      {" • "}
                      {selectedWth.description}
                    </p>
                  )}
                </div>
                {form.wthTypeId === "custom" ? (
                  <div className="app-form-group" style={{ marginBottom: 0 }}>
                    <label className="app-label">% หัก (กำหนดเอง)</label>
                    <input
                      type="number"
                      value={form.customWthRate}
                      onChange={(e) =>
                        setForm({ ...form, customWthRate: parseFloat(e.target.value) || 0 })
                      }
                      min={0}
                      max={100}
                      step={0.5}
                      className="app-input num"
                      disabled={isReadOnly}
                    />
                  </div>
                ) : (
                  <div className="app-form-group" style={{ marginBottom: 0 }}>
                    <label className="app-checkbox" style={{ marginTop: "1.75rem" }}>
                      <input
                        type="checkbox"
                        checked={form.isVatPayee}
                        onChange={(e) =>
                          setForm({ ...form, isVatPayee: e.target.checked })
                        }
                        disabled={isReadOnly}
                      />
                      ผู้รับเงินเป็น VAT (คิด 7%)
                    </label>
                  </div>
                )}
              </div>

              {form.wthTypeId === "custom" && (
                <div className="app-form-group" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                  <label className="app-checkbox">
                    <input
                      type="checkbox"
                      checked={form.isVatPayee}
                      onChange={(e) =>
                        setForm({ ...form, isVatPayee: e.target.checked })
                      }
                      disabled={isReadOnly}
                    />
                    ผู้รับเงินเป็น VAT (คิด 7%)
                  </label>
                </div>
              )}

              {/* Live Calc Display */}
              <div
                style={{
                  marginTop: "0.875rem",
                  padding: "0.75rem 1rem",
                  background: "white",
                  borderRadius: "0.5rem",
                  border: "1px solid #e2e8f0",
                  display: "grid",
                  gap: "0.375rem",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <CalcRow label="ยอดรวมก่อนภาษี (Subtotal)" value={calc.ttlAmount} color="#475569" />
                {calc.wthAmount > 0 && (
                  <CalcRow
                    label={`หัก ณ ที่จ่าย ${effectiveWthRate}%`}
                    value={-calc.wthAmount}
                    color="#dc2626"
                  />
                )}
                {calc.vatAmount > 0 && (
                  <CalcRow
                    label="VAT 7%"
                    value={calc.vatAmount}
                    color="#2563eb"
                  />
                )}
                <div
                  style={{
                    paddingTop: "0.375rem",
                    borderTop: "1px dashed #e2e8f0",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>
                    ยอดชำระสุทธิ (รวม VAT หัก WHT)
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "1.125rem",
                      color: "#16a34a",
                    }}
                  >
                    ฿{formatNumber(calc.gttlAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Invoice Number + Due Date */}
            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label">เลขที่ใบแจ้งหนี้ / Invoice No.</label>
                <input
                  type="text"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                  placeholder="เช่น INV-2026-0001"
                  className="app-input"
                  maxLength={50}
                  disabled={isReadOnly}
                />
                <p className="app-hint">สำหรับใช้ตั้งชื่อไฟล์</p>
              </div>
              <div className="app-form-group">
                <label className="app-label app-label-required">วันครบกำหนด</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="app-input"
                  disabled={isReadOnly}
                />
                <p className="app-hint">ใช้จัดเก็บไฟล์แยกเดือน</p>
              </div>
            </div>

            {/* Invoice/Receipt file links (read-only) */}
            {isReadOnly && payment?.invoiceFileUrl && (
              <div className="app-form-group">
                <label className="app-label">📎 ใบแจ้งหนี้</label>
                <a
                  href={payment.invoiceFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="app-btn app-btn-secondary"
                  style={{ justifyContent: "flex-start" }}
                >
                  📄 ดูไฟล์ใบแจ้งหนี้ →
                </a>
              </div>
            )}

            {/* Receipt file (stage 2 — only show if paid) */}
            {isReadOnly && payment?.receiptUrl && (
              <div className="app-form-group">
                <label className="app-label">🧾 ใบเสร็จ / ใบกำกับภาษี</label>
                <a
                  href={payment.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="app-btn app-btn-secondary"
                  style={{ justifyContent: "flex-start" }}
                >
                  🧾 ดูใบเสร็จ →
                </a>
              </div>
            )}

            {/* ข้อมูลภาษีย้ายไปบันทึกค่าใช้จ่ายแล้ว — ตั้งเบิกใช้แค่ข้อมูลพื้นฐาน */}
            <div className="app-form-group" style={{ marginBottom: "0.75rem" }}>
              <label className="app-label">ผู้ขออนุญาตเบิกจ่าย</label>
              <input
                type="text"
                value={form.requesterName}
                onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
                placeholder="ชื่อผู้เบิก"
                className="app-input"
                maxLength={100}
                disabled={isReadOnly}
              />
              <p className="app-hint">ค่าเริ่มต้น = ชื่อผู้ใช้ปัจจุบัน</p>
            </div>

            <div className="app-form-group">
              <label className="app-label">หมายเหตุ</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="ข้อมูลเพิ่มเติม"
                className="app-textarea"
                rows={2}
                maxLength={1000}
                disabled={isReadOnly}
              />
            </div>
          </div>

          <div className="app-modal-footer">
            {isEdit && !isReadOnly && (
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
              {isReadOnly ? "ปิด" : "ยกเลิก"}
            </button>
            {!isReadOnly && (
              <button
                type="submit"
                disabled={isLoading || uploading}
                className="app-btn app-btn-primary"
              >
                {uploading ? (
                  <>
                    <span className="app-spinner" /> กำลังอัปโหลด...
                  </>
                ) : isLoading ? (
                  <>
                    <span className="app-spinner" /> กำลังบันทึก...
                  </>
                ) : isEdit ? (
                  "บันทึก"
                ) : (
                  `สร้าง (฿${formatNumber(calc.gttlAmount)})`
                )}
              </button>
            )}
          </div>
        </form>
      </div>
      <style jsx>{`
        .expense-type-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1rem;
          border: 2px solid #e2e8f0;
          border-radius: 0.75rem;
          cursor: pointer;
          transition: all 150ms;
          background: white;
          text-align: center;
        }
        .expense-type-card:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .expense-type-card.selected {
          border-color: #2563eb;
          background: #eff6ff;
        }
      `}</style>
    </div>
  );
}

function CalcRow({
  label,
  value,
  color = "#475569",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
      <span style={{ color }}>{label}</span>
      <span style={{ color, fontWeight: 500 }}>
        {value < 0 ? "-" : ""}฿{formatNumber(Math.abs(value))}
      </span>
    </div>
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
