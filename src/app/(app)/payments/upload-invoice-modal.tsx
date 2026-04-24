"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { WTH_TYPES } from "@/lib/wth-types";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";
import {
  EXPENSE_CATEGORIES_MAIN,
  DOCUMENT_TYPE_OPTIONS,
  EXPENSE_NATURE_OPTIONS,
} from "@/lib/constants/expense-categories";
import { pdfFirstPageToImage, isPdfFile } from "@/lib/utils/pdf-to-image";

interface Event {
  eventId: string;
  eventName: string;
  status: string;
}

interface Payee {
  payeeId: string;
  payeeName: string;
  taxId: string;
  isVAT: boolean;
  defaultWTH: number;
  bankName: string;
  bankAccount: string;
  address: string;
  phone: string;
}

interface ExtractedData {
  vendorName: string | null;
  vendorAddress: string | null;
  vendorTaxId: string | null;
  vendorPhone: string | null;
  invoiceNumber: string | null;
  documentDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  hasVat: boolean;
  items: Array<{
    description: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
  }>;
  confidence: number;
  provider: string;
}

interface LineItem {
  id: string;
  description: string;
  amount: number;
  wthTypeId: string;
  customWthRate: number;
  hasVat: boolean;
}

export function UploadInvoiceModal({
  events,
  payees,
  onClose,
  onSuccess,
}: {
  events: Event[];
  payees: Payee[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const utils = trpc.useUtils();
  const companyBanksQuery = trpc.companyBank.listForPayment.useQuery();
  const subscriptionQuery = trpc.subscription.current.useQuery();
  const masterBanksQuery = trpc.bank.list.useQuery();
  const paymentsQuery = trpc.payment.list.useQuery();
  const companyBanks = companyBanksQuery.data || [];
  const subscription = subscriptionQuery.data;
  const masterBanks = masterBanksQuery.data || [];
  const allPayments = paymentsQuery.data || [];

  const createPaymentMut = trpc.payment.create.useMutation();
  const createPayeeMut = trpc.payee.create.useMutation();

  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "processing" | "done" | "failed">("idle");
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Split mode
  const [splitMode, setSplitMode] = useState<"single" | "multi">("single");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // ID card upload for payee
  const [idCardStatus, setIdCardStatus] = useState<"idle" | "processing" | "done" | "failed">("idle");

  // Main form
  const [form, setForm] = useState({
    eventId: "",
    payeeId: "",
    newPayeeName: "",
    newPayeeTaxId: "",
    newPayeeAddress: "",
    newPayeePhone: "",
    newPayeeBankName: "",
    newPayeeBankAccount: "",
    createNewPayee: false,
    expenseType: "account" as "team" | "account",
    companyBankId: "",
    invoiceNumber: "",
    description: "",
    totalAmount: 0,
    hasVat: false,
    wthTypeId: "none",
    customWthRate: 0,
    dueDate: addDaysISO(15),
    notes: "",
    costPerUnit: 0,
    days: 1,
    numberOfPeople: 1,
    // R5/R6: tax compliance
    documentType: "tax_invoice" as "" | "receipt" | "tax_invoice",
    expenseNature: "" as "" | "goods" | "service",
    categoryMain: "",
    categorySub: "",
    requesterName: "",
  });

  // R6: default RequesterName = ชื่อ user ปัจจุบัน
  const meQuery = trpc.org.me.useQuery();
  useEffect(() => {
    if (!form.requesterName && meQuery.data?.displayName) {
      setForm((prev) => ({ ...prev, requesterName: meQuery.data!.displayName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meQuery.data?.displayName]);

  const selectedWth = WTH_TYPES.find((t) => t.id === form.wthTypeId) || WTH_TYPES[0];
  const effectiveWthRate = form.wthTypeId === "custom" ? form.customWthRate : selectedWth.rate;

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Auto-select default company bank when switching to Account expense
  useEffect(() => {
    if (form.expenseType !== "account") return;
    if (form.companyBankId) return;
    const def = companyBanks.find((b) => b.isDefault);
    if (def) {
      setForm((prev) => ({ ...prev, companyBankId: def.companyBankId }));
    } else if (companyBanks.length === 1) {
      // single bank → auto-select
      setForm((prev) => ({ ...prev, companyBankId: companyBanks[0].companyBankId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyBanks.length, form.expenseType]);

  const validateFile = (f: File): string | null => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(f.type)) return "รองรับเฉพาะ jpg, png, pdf";
    if (f.size > 10 * 1024 * 1024) return "ไฟล์ใหญ่เกิน 10 MB";
    return null;
  };

  const handleFileSelect = async (f: File) => {
    setError(null);
    const err = validateFile(f);
    if (err) {
      setError(err);
      return;
    }
    setFile(f);
    await runOcr(f);
  };

  const runOcr = async (f: File) => {
    setOcrStatus("processing");
    setError(null);
    try {
      // PDF → convert to PNG for OCR (supports scanned PDFs)
      let ocrFile = f;
      if (isPdfFile(f)) {
        try {
          ocrFile = await pdfFirstPageToImage(f, 2);
        } catch (pdfErr) {
          console.warn("PDF→image conversion failed, sending raw PDF:", pdfErr);
        }
      }

      const fd = new FormData();
      fd.append("file", ocrFile);
      fd.append("documentType", "invoice");
      const res = await fetch("/api/ocr/receipt", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `OCR ล้มเหลว (HTTP ${res.status})`);
      }
      const result = await res.json();
      const data = result.data as ExtractedData;
      setExtracted(data);

      const matched = data.vendorName
        ? findBestPayeeMatch(data.vendorName, data.vendorTaxId, payees)
        : null;

      setForm((prev) => ({
        ...prev,
        payeeId: matched?.payeeId || prev.payeeId,
        createNewPayee: !matched && !!data.vendorName,
        newPayeeName: data.vendorName || "",
        newPayeeTaxId: data.vendorTaxId || "",
        newPayeeAddress: data.vendorAddress || "",
        newPayeePhone: data.vendorPhone || "",
        invoiceNumber: data.invoiceNumber || prev.invoiceNumber,
        description: prev.description || (data.vendorName
          ? `${data.vendorName}${data.invoiceNumber ? " - " + data.invoiceNumber : ""}`
          : ""),
        totalAmount: data.totalAmount || data.subtotal || prev.totalAmount,
        hasVat: data.hasVat,
        dueDate: data.dueDate || prev.dueDate,
      }));

      // Pre-populate line items from OCR
      if (data.items && data.items.length > 1) {
        setLineItems(
          data.items.map((it, idx) => ({
            id: `item-${idx}`,
            description: it.description || `รายการที่ ${idx + 1}`,
            amount: it.amount || 0,
            wthTypeId: "none",
            customWthRate: 0,
            hasVat: data.hasVat,
          }))
        );
      } else {
        setLineItems([]);
      }

      // Refresh subscription to update used credits
      utils.subscription.current.invalidate();

      setOcrStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "OCR ล้มเหลว — กรอกด้วยตนเอง");
      setOcrStatus("failed");
    }
  };

  // ===== ID Card OCR for individual payees =====
  const handleIdCardUpload = async (f: File) => {
    setError(null);
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setIdCardStatus("processing");
    try {
      let ocrFile = f;
      if (isPdfFile(f)) {
        try { ocrFile = await pdfFirstPageToImage(f, 2); } catch (e2) { console.warn("PDF→image failed:", e2); }
      }
      const fd = new FormData();
      fd.append("file", ocrFile);
      fd.append("documentType", "id_card");
      const res = await fetch("/api/ocr/receipt", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `OCR ล้มเหลว (${res.status})`);
      }
      const result = await res.json();
      const data = result.data;

      // Fill payee fields from ID card
      if (data.vendorName || data.vendorTaxId) {
        // Check if payee already exists
        const matched = data.vendorName ? findBestPayeeMatch(data.vendorName, data.vendorTaxId, payees) : null;
        if (matched) {
          // Payee exists → select it
          setForm((p) => ({ ...p, payeeId: matched.payeeId, createNewPayee: false }));
        } else {
          // New payee → fill form
          setForm((p) => ({
            ...p,
            createNewPayee: true,
            newPayeeName: data.vendorName || p.newPayeeName,
            newPayeeTaxId: data.vendorTaxId || p.newPayeeTaxId,
            newPayeeAddress: data.vendorAddress || p.newPayeeAddress,
          }));
        }
      }

      utils.subscription.current.invalidate();
      setIdCardStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านบัตรประชาชนไม่สำเร็จ");
      setIdCardStatus("failed");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        description: "",
        amount: 0,
        wthTypeId: "none",
        customWthRate: 0,
        hasVat: form.hasVat,
      },
    ]);
  };

  const updateLineItem = (id: string, patch: Partial<LineItem>) => {
    setLineItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((it) => it.id !== id));
  };

  const lineItemsTotal = lineItems.reduce((s, it) => s + (it.amount || 0), 0);

  const canSave = (): boolean => {
    if (!form.eventId) return false;
    if (form.createNewPayee) {
      if (!form.newPayeeName.trim()) return false;
    } else {
      if (!form.payeeId) return false;
    }
    if (form.expenseType === "account" && !form.companyBankId) return false;
    if (!form.dueDate) return false;
    if (splitMode === "single") {
      if (form.totalAmount <= 0) return false;
      if (!form.description.trim()) return false;
    } else {
      if (lineItems.length === 0) return false;
      if (lineItems.some((it) => it.amount <= 0 || !it.description.trim())) return false;
    }
    return true;
  };

  const handleSave = async () => {
    setError(null);
    if (!canSave()) {
      setError("กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    try {
      // Create Payee if new
      let payeeId = form.payeeId;
      if (form.createNewPayee) {
        const p = await createPayeeMut.mutateAsync({
          payeeName: form.newPayeeName.trim(),
          taxId: form.newPayeeTaxId.trim() || undefined,
          address: form.newPayeeAddress.trim() || undefined,
          phone: form.newPayeePhone.trim() || undefined,
          bankName: form.newPayeeBankName.trim() || undefined,
          bankAccount: form.newPayeeBankAccount.trim() || undefined,
          isVAT: form.hasVat,
          defaultWTH: effectiveWthRate,
        });
        payeeId = p.payeeId;
      }

      const sharedBase = {
        eventId: form.eventId,
        payeeId,
        expenseType: form.expenseType,
        companyBankId: form.companyBankId || undefined,
        invoiceNumber: form.invoiceNumber.trim() || undefined,
        dueDate: form.dueDate,
        notes: form.notes.trim() || undefined,
        // R5/R6: tax compliance
        documentType: form.documentType || undefined,
        expenseNature: form.expenseNature || undefined,
        categoryMain: form.categoryMain.trim() || undefined,
        categorySub: form.categorySub.trim() || undefined,
        requesterName: form.requesterName.trim() || undefined,
      };

      let firstPaymentId: string | null = null;

      if (splitMode === "single") {
        const useBreakdown = showAdvanced && form.costPerUnit > 0;
        // Note: ถ้า hasVat=true → ยอดรวม (totalAmount) คือยอดรวม VAT แล้ว
        //   ดังนั้น costPerUnit = totalAmount / 1.07 เพื่อให้ server คำนวณ VAT 7% กลับมาได้ตรง
        // ถ้า hasVat=false → totalAmount = costPerUnit × days × people ตรง ๆ
        const costPerUnit = useBreakdown
          ? form.costPerUnit
          : form.hasVat
          ? form.totalAmount / 1.07
          : form.totalAmount;
        const days = useBreakdown ? form.days : 1;
        const numberOfPeople = useBreakdown ? form.numberOfPeople : 1;

        // Validate: ต้องมี description ที่ user ใส่จริง (ไม่ใช้ fallback "รายจ่าย"
        // เพราะจะทำให้ข้อมูลใน Sheet ไม่ตรงกับเจตนาของ user)
        const description = form.description.trim();
        if (!description) {
          throw new Error('กรุณากรอก "รายละเอียด" ก่อนบันทึก');
        }

        const result = await createPaymentMut.mutateAsync({
          ...sharedBase,
          description,
          costPerUnit: Math.round(costPerUnit * 100) / 100,
          days,
          numberOfPeople,
          pctWTH: effectiveWthRate,
          isVatPayee: form.hasVat,
        });
        firstPaymentId = result.paymentId;
      } else {
        // Multi-line: create 1 payment per line item
        for (let i = 0; i < lineItems.length; i++) {
          const item = lineItems[i];
          const selWth = WTH_TYPES.find((t) => t.id === item.wthTypeId) || WTH_TYPES[0];
          const itemWthRate = item.wthTypeId === "custom" ? item.customWthRate : selWth.rate;
          const costPerUnit = item.hasVat ? item.amount / 1.07 : item.amount;

          const result = await createPaymentMut.mutateAsync({
            ...sharedBase,
            description: item.description.trim(),
            costPerUnit: Math.round(costPerUnit * 100) / 100,
            days: 1,
            numberOfPeople: 1,
            pctWTH: itemWthRate,
            isVatPayee: item.hasVat,
          });
          if (i === 0) firstPaymentId = result.paymentId;
        }
      }

      // Upload invoice file attached to FIRST payment (shared invoice)
      if (file && firstPaymentId) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("paymentId", firstPaymentId);
        fd.append("fileType", "invoice");
        fd.append("invoiceNumber", form.invoiceNumber.trim());
        // ส่ง receiptDate (ใช้ dueDate เป็นตัวแทนวันเอกสารสำหรับ invoice)
        //   invoice ยังไม่จ่าย — ยังไม่มีใบเสร็จ → ใช้ dueDate จัด folder
        if (form.dueDate) fd.append("receiptDate", form.dueDate);
        if (form.description.trim()) fd.append("description", form.description.trim());
        const upRes = await fetch("/api/payments/upload", { method: "POST", body: fd });
        if (!upRes.ok) {
          const d = await upRes.json().catch(() => ({}));
          throw new Error(d.error || "อัปโหลดใบแจ้งหนี้ไม่สำเร็จ");
        }
      }

      utils.payment.list.invalidate();
      utils.payee.list.invalidate();
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const isSaving = createPaymentMut.isPending || createPayeeMut.isPending;

  // Calc for single mode
  const vatCalc = form.hasVat ? (form.totalAmount / 1.07) * 0.07 : 0;
  const subtotalCalc = form.hasVat ? form.totalAmount - vatCalc : form.totalAmount;
  const wthAmount = (subtotalCalc * effectiveWthRate) / 100;
  const netPayment = form.totalAmount - wthAmount;

  // ===== SMART ALERTS =====
  // Budget Alert: compare against selected event
  const selectedEvent = events.find((e) => e.eventId === form.eventId) as
    | (Event & { budget?: number; totalSpent?: number })
    | undefined;
  const budgetAlert = (() => {
    if (!selectedEvent || !form.eventId) return null;
    const budget = (selectedEvent as { budget?: number }).budget ?? 0;
    const spent = (selectedEvent as { totalSpent?: number }).totalSpent ?? 0;
    if (budget <= 0) return null;
    const newAmount = splitMode === "multi" ? lineItemsTotal : form.totalAmount;
    if (newAmount <= 0) return null;
    const afterSpent = spent + newAmount;
    const pctBefore = (spent / budget) * 100;
    const pctAfter = (afterSpent / budget) * 100;
    const remaining = budget - afterSpent;
    return {
      budget,
      spent,
      newAmount,
      afterSpent,
      remaining,
      pctBefore,
      pctAfter,
      isOver: afterSpent > budget,
      isNearLimit: pctAfter >= 90 && pctAfter < 100,
    };
  })();

  // Duplicate Detection: find similar recent payments
  const duplicates = (() => {
    if (!form.payeeId && !form.createNewPayee) return [];
    if (form.totalAmount <= 0 && splitMode !== "multi") return [];
    const targetAmount = splitMode === "multi" ? lineItemsTotal : form.totalAmount;
    if (targetAmount <= 0) return [];

    const payeeId = form.payeeId || null;
    const targetInvoice = form.invoiceNumber.trim().toLowerCase();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    return allPayments
      .filter((p) => {
        if (p.status === "rejected") return false;
        // Match within 30 days
        const createdAt = p.createdAt ? new Date(p.createdAt).getTime() : 0;
        if (createdAt < thirtyDaysAgo) return false;

        // Match by invoice number (strong signal)
        if (targetInvoice && p.invoiceNumber &&
            p.invoiceNumber.trim().toLowerCase() === targetInvoice) {
          return true;
        }
        // Match by payee + amount (medium signal)
        if (payeeId && p.payeeId === payeeId) {
          const diff = Math.abs(p.gttlAmount - targetAmount);
          if (diff < 1) return true; // exact match
        }
        return false;
      })
      .slice(0, 3);
  })();

  return (
    <div
      className="app-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="app-modal"
        style={{ maxWidth: "min(1100px, 95vw)", maxHeight: "95vh" }}
      >
        <div className="app-modal-header">
          <h3 className="app-modal-title">
            📝 สร้างรายจ่าย
            {ocrStatus === "processing" && (
              <span style={{ marginLeft: "0.75rem", fontSize: "0.8125rem", color: "#2563eb" }}>
                <span className="app-spinner" style={{ verticalAlign: "middle", marginRight: "0.375rem" }} />
                ระบบกำลังอ่าน...
              </span>
            )}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <CreditBadge
              subscription={subscription}
              showUsed={ocrStatus === "done"}
            />
            <button onClick={onClose} className="app-btn app-btn-ghost app-btn-icon">
              ✕
            </button>
          </div>
        </div>

        <div
          className="app-modal-body"
          style={{
            padding: 0,
            display: "grid",
            gridTemplateColumns: file ? "1fr 1.2fr" : "1fr",
            gap: 0,
            minHeight: "500px",
            maxHeight: "calc(95vh - 140px)",
            overflow: "auto",
          }}
        >
          {/* LEFT: File Preview */}
          {file && filePreviewUrl && (
            <div
              style={{
                borderRight: "1px solid #e2e8f0",
                background: "#f8fafc",
                overflow: "auto",
                position: "relative",
              }}
            >
              {file.type === "application/pdf" ? (
                <iframe
                  src={filePreviewUrl}
                  style={{ width: "100%", height: "100%", minHeight: "500px", border: "none" }}
                  title="Invoice preview"
                />
              ) : (
                <div style={{ padding: "1rem", textAlign: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={filePreviewUrl}
                    alt="Invoice"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "calc(95vh - 200px)",
                      objectFit: "contain",
                      borderRadius: "0.5rem",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                  />
                </div>
              )}
              <button
                onClick={() => {
                  setFile(null);
                  setExtracted(null);
                  setOcrStatus("idle");
                  setLineItems([]);
                }}
                style={{
                  position: "absolute",
                  top: "0.75rem",
                  right: "0.75rem",
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.375rem",
                  padding: "0.375rem 0.75rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                ✕ ลบไฟล์
              </button>
            </div>
          )}

          {/* RIGHT: Form */}
          <div style={{ padding: "1.25rem", overflow: "auto" }}>
            {error && <div className="app-error-msg">{error}</div>}

            {/* Project */}
            <div className="app-form-group">
              <label className="app-label app-label-required">🎯 โปรเจกต์</label>
              <SearchableSelect
                options={events
                  .filter((e) => e.status !== "cancelled")
                  .map((e) => ({
                    value: e.eventId,
                    label: e.eventName,
                  }))}
                value={form.eventId}
                onChange={(val) => setForm({ ...form, eventId: val })}
                className="app-select"
                emptyLabel="— เลือกโปรเจกต์ —"
              />
            </div>

            {/* File upload */}
            {!file ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                style={{
                  border: isDragging ? "2px solid #3b82f6" : "2px dashed #cbd5e1",
                  borderRadius: "0.75rem",
                  padding: "1.75rem 1rem",
                  textAlign: "center",
                  background: isDragging ? "#eff6ff" : "#f8fafc",
                  transition: "all 200ms",
                  cursor: "pointer",
                  marginBottom: "1rem",
                }}
                onClick={() => document.getElementById("invoice-file-input")?.click()}
              >
                <div style={{ fontSize: "2rem", marginBottom: "0.375rem" }}>📎</div>
                <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#0f172a", margin: 0 }}>
                  แนบไฟล์ Invoice — ระบบอ่านให้อัตโนมัติ
                </p>
                <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" }}>
                  ลากวางหรือคลิก • jpg, png, pdf (สูงสุด 10 MB)
                </p>
                <input
                  id="invoice-file-input"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                  style={{ display: "none" }}
                />
              </div>
            ) : ocrStatus === "processing" ? (
              <div
                style={{
                  padding: "0.875rem 1rem",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  color: "#1e40af",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                }}
              >
                <span className="app-spinner" />
                ระบบกำลังอ่านข้อมูล... (5-15 วินาที)
              </div>
            ) : null}

            {/* Expense Type */}
            <div className="app-form-group">
              <label className="app-label app-label-required">💳 ประเภทรายจ่าย</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, expenseType: "account" })}
                  className={`app-btn ${form.expenseType === "account" ? "app-btn-primary" : "app-btn-secondary"}`}
                  style={{ flex: 1 }}
                >
                  🏦 โอนบัญชี
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, expenseType: "team", companyBankId: "" })}
                  className={`app-btn ${form.expenseType === "team" ? "app-btn-primary" : "app-btn-secondary"}`}
                  style={{ flex: 1 }}
                >
                  💵 เบิกเงินสด
                </button>
              </div>
            </div>

            {form.expenseType === "account" && (
              <div className="app-form-group">
                <label className="app-label app-label-required">บัญชีต้นทาง</label>
                {companyBanks.length === 0 ? (
                  <div style={{ padding: "0.75rem", background: "#fef3c7", borderRadius: "0.5rem", fontSize: "0.8125rem", color: "#854d0e" }}>
                    ⚠️ ยังไม่มีบัญชีบริษัท —{" "}
                    <a href="/settings/org" target="_blank" style={{ textDecoration: "underline", fontWeight: 600 }}>
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
                    onChange={(val) => setForm({ ...form, companyBankId: val })}
                    className="app-select"
                    emptyLabel="— เลือกบัญชี —"
                  />
                )}
              </div>
            )}

            {/* Payee */}
            <div className="app-form-group">
              <label className="app-label app-label-required">👤 ผู้รับเงิน</label>

              {/* ID Card upload — always visible for quick payee creation from ID card */}
              <label
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.5rem 0.75rem", marginBottom: "0.625rem",
                  border: "1px dashed #a78bfa", borderRadius: "0.375rem",
                  background: idCardStatus === "done" ? "#f0fdf4" : "#faf5ff",
                  cursor: idCardStatus === "processing" ? "wait" : "pointer",
                  fontSize: "0.8125rem", color: idCardStatus === "done" ? "#166534" : "#6d28d9",
                  transition: "all 150ms",
                }}
              >
                {idCardStatus === "processing" ? (
                  <><span className="app-spinner" style={{ width: "14px", height: "14px" }} /> กำลังอ่านบัตรประชาชน...</>
                ) : idCardStatus === "done" ? (
                  <>✅ อ่านบัตรประชาชนแล้ว — ข้อมูลถูกเติมอัตโนมัติ</>
                ) : (
                  <>🪪 แนบสำเนาบัตรประชาชน (อ่านข้อมูลอัตโนมัติ)</>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIdCardUpload(f); e.target.value = ""; }}
                  style={{ display: "none" }}
                  disabled={idCardStatus === "processing"}
                />
              </label>

              {form.createNewPayee ? (
                <div
                  style={{
                    padding: "0.875rem",
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    borderRadius: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.625rem" }}>
                    <span style={{ fontWeight: 600, color: "#9a3412", fontSize: "0.8125rem" }}>
                      ✨ สร้าง Payee ใหม่
                    </span>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, createNewPayee: false })}
                      className="app-btn app-btn-ghost app-btn-sm"
                    >
                      เลือกจากรายการ
                    </button>
                  </div>

                  <div className="app-form-grid cols-2" style={{ gap: "0.5rem" }}>
                    <input
                      type="text"
                      value={form.newPayeeName}
                      onChange={(e) => setForm({ ...form, newPayeeName: e.target.value })}
                      placeholder="ชื่อ *"
                      className="app-input"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.newPayeeTaxId}
                      onChange={(e) => setForm({ ...form, newPayeeTaxId: e.target.value.replace(/\D/g, "").slice(0, 13) })}
                      placeholder="เลขภาษี 13 หลัก"
                      className="app-input mono"
                    />
                  </div>
                  <textarea
                    value={form.newPayeeAddress}
                    onChange={(e) => setForm({ ...form, newPayeeAddress: e.target.value })}
                    placeholder="ที่อยู่"
                    rows={2}
                    className="app-textarea"
                    style={{ marginTop: "0.5rem" }}
                  />
                  <div className="app-form-grid cols-2" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                    <SearchableSelect
                      options={[
                        { value: "เงินสด", label: "💵 เงินสด" },
                        ...masterBanks.map((b) => ({
                          value: b.bankName,
                          label: b.bankName,
                        })),
                      ]}
                      value={form.newPayeeBankName}
                      onChange={(val) => setForm({ ...form, newPayeeBankName: val, newPayeeBankAccount: val === "เงินสด" ? "" : form.newPayeeBankAccount })}
                      className="app-select"
                      emptyLabel="— เลือกธนาคาร —"
                    />
                    {form.newPayeeBankName !== "เงินสด" && (
                      <input
                        type="text"
                        value={form.newPayeeBankAccount}
                        onChange={(e) => setForm({ ...form, newPayeeBankAccount: e.target.value })}
                        placeholder="เลขบัญชี xxx-x-xxxxx-x"
                        className="app-input mono"
                      />
                    )}
                  </div>
                  {masterBanks.length === 0 ? (
                    <p className="app-hint" style={{ marginTop: "0.25rem" }}>
                      ยังไม่มีรายชื่อธนาคาร —{" "}
                      <a href="/banks" target="_blank" style={{ color: "#2563eb" }}>
                        ไปจัดการธนาคาร
                      </a>
                    </p>
                  ) : (
                    <p className="app-hint" style={{ marginTop: "0.25rem" }}>
                      ไม่มีธนาคารในรายการ?{" "}
                      <a href="/banks" target="_blank" style={{ color: "#2563eb" }}>
                        เพิ่มธนาคารใหม่
                      </a>
                    </p>
                  )}
                </div>
              ) : (
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
                    emptyLabel="— เลือก —"
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, createNewPayee: true, payeeId: "" })}
                    className="app-btn app-btn-secondary app-btn-sm"
                  >
                    ➕ ใหม่
                  </button>
                </div>
              )}
            </div>

            <div className="app-form-grid cols-2">
              <div className="app-form-group">
                <label className="app-label">เลข Invoice</label>
                <input
                  type="text"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                  className="app-input"
                />
              </div>
              <div className="app-form-group">
                <label className="app-label app-label-required">📅 Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="app-input"
                />
              </div>
            </div>

            {/* Split Mode Toggle (only show after OCR or with items) */}
            {ocrStatus === "done" && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem",
                  background: "#f5f3ff",
                  border: "1px solid #ddd6fe",
                  borderRadius: "0.625rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#5b21b6", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    💡 วิธีบันทึก
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => setSplitMode("single")}
                    className={`app-btn ${splitMode === "single" ? "app-btn-primary" : "app-btn-secondary"}`}
                    style={{ flex: 1 }}
                  >
                    📋 รวมเป็น 1 รายการ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitMode("multi");
                      if (lineItems.length === 0) {
                        setLineItems([
                          {
                            id: `item-${Date.now()}`,
                            description: "",
                            amount: 0,
                            wthTypeId: "none",
                            customWthRate: 0,
                            hasVat: form.hasVat,
                          },
                        ]);
                      }
                    }}
                    className={`app-btn ${splitMode === "multi" ? "app-btn-primary" : "app-btn-secondary"}`}
                    style={{ flex: 1 }}
                  >
                    🔀 แยก {lineItems.length > 0 ? `${lineItems.length} ` : ""}รายการ
                  </button>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#5b21b6", margin: "0.5rem 0 0 0" }}>
                  {splitMode === "single"
                    ? "บันทึกเป็น 1 row ใน Google Sheet (ยอดรวม)"
                    : "บันทึกแยกเป็นหลาย rows (1 row ต่อรายการ) — ใช้ Invoice + Due Date + Payee ร่วมกัน"}
                </p>
              </div>
            )}

            {/* Single Mode */}
            {splitMode === "single" && (
              <>
                <div className="app-form-group">
                  <label className="app-label app-label-required">รายละเอียด</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="เช่น ค่าอาหาร, ค่าวิทยากร, ค่าเช่าสถานที่..."
                    className="app-input"
                  />
                  <p className="app-hint">รายละเอียดที่บันทึกใน Google Sheet</p>
                </div>

                <div className="app-form-group">
                  <label className="app-label app-label-required">ยอดรวม (บาท)</label>
                  <input
                    type="number"
                    value={form.totalAmount}
                    onChange={(e) => setForm({ ...form, totalAmount: parseFloat(e.target.value) || 0 })}
                    min={0}
                    step={0.01}
                    className="app-input num"
                  />
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    padding: "0.875rem",
                    borderRadius: "0.625rem",
                    border: "1px solid #e2e8f0",
                    marginBottom: "1rem",
                  }}
                >
                  <div className="app-form-group" style={{ marginBottom: "0.625rem" }}>
                    <label className="app-checkbox">
                      <input
                        type="checkbox"
                        checked={form.hasVat}
                        onChange={(e) => setForm({ ...form, hasVat: e.target.checked })}
                      />
                      มี VAT 7% (รวมในยอด)
                    </label>
                  </div>

                  <div className="app-form-grid cols-2" style={{ gap: "0.625rem" }}>
                    <div>
                      <label className="app-label" style={{ fontSize: "0.75rem" }}>
                        ประเภทการหัก ณ ที่จ่าย
                      </label>
                      <SearchableSelect
                        options={WTH_TYPES.map((t) => ({
                          value: t.id,
                          label: t.label,
                        }))}
                        value={form.wthTypeId}
                        onChange={(val) => setForm({ ...form, wthTypeId: val })}
                        className="app-select"
                      />
                    </div>
                    {form.wthTypeId === "custom" && (
                      <div>
                        <label className="app-label" style={{ fontSize: "0.75rem" }}>% หัก</label>
                        <input
                          type="number"
                          value={form.customWthRate}
                          onChange={(e) => setForm({ ...form, customWthRate: parseFloat(e.target.value) || 0 })}
                          min={0}
                          max={100}
                          step={0.5}
                          className="app-input num"
                        />
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: "0.625rem",
                      paddingTop: "0.625rem",
                      borderTop: "1px dashed #e2e8f0",
                      fontSize: "0.8125rem",
                      display: "grid",
                      gap: "0.25rem",
                    }}
                  >
                    {form.hasVat && (
                      <>
                        <Row label="ยอดก่อน VAT" value={subtotalCalc} />
                        <Row label="VAT 7%" value={vatCalc} color="#2563eb" />
                      </>
                    )}
                    {effectiveWthRate > 0 && (
                      <Row label={`หัก ณ ที่จ่าย ${effectiveWthRate}%`} value={-wthAmount} color="#dc2626" />
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.375rem", borderTop: effectiveWthRate > 0 ? "1px dashed #e2e8f0" : "none" }}>
                      <span style={{ fontWeight: 700 }}>ยอดจ่ายจริง</span>
                      <span style={{ fontWeight: 700, color: "#16a34a" }}>
                        ฿{formatNumber(netPayment)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="app-form-group" style={{ marginBottom: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="app-btn app-btn-ghost app-btn-sm"
                    style={{ padding: 0 }}
                  >
                    {showAdvanced ? "▲" : "▼"} ข้อมูลเพิ่มเติม (ค่าต่อหน่วย × วัน × คน)
                  </button>
                  {showAdvanced && (
                    <div style={{ marginTop: "0.625rem", padding: "0.75rem", background: "#f1f5f9", borderRadius: "0.5rem" }}>
                      <div className="app-form-grid cols-3" style={{ gap: "0.5rem" }}>
                        <div>
                          <label className="app-label" style={{ fontSize: "0.75rem" }}>ค่าต่อหน่วย</label>
                          <input type="number" value={form.costPerUnit}
                            onChange={(e) => setForm({ ...form, costPerUnit: parseFloat(e.target.value) || 0 })}
                            min={0} className="app-input num" />
                        </div>
                        <div>
                          <label className="app-label" style={{ fontSize: "0.75rem" }}>วัน</label>
                          <input type="number" value={form.days}
                            onChange={(e) => setForm({ ...form, days: parseInt(e.target.value, 10) || 1 })}
                            min={1} className="app-input num" />
                        </div>
                        <div>
                          <label className="app-label" style={{ fontSize: "0.75rem" }}>คน/หน่วย</label>
                          <input type="number" value={form.numberOfPeople}
                            onChange={(e) => setForm({ ...form, numberOfPeople: parseInt(e.target.value, 10) || 1 })}
                            min={1} className="app-input num" />
                        </div>
                      </div>
                      <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#475569" }}>
                        = ฿{formatNumber(form.costPerUnit * form.days * form.numberOfPeople)}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Multi Line Items Mode */}
            {splitMode === "multi" && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "0.875rem",
                  borderRadius: "0.625rem",
                  border: "1px solid #e2e8f0",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.625rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    🔀 รายการย่อย ({lineItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="app-btn app-btn-secondary app-btn-sm"
                  >
                    + เพิ่มรายการ
                  </button>
                </div>

                {lineItems.map((item, idx) => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    index={idx}
                    onUpdate={(patch) => updateLineItem(item.id, patch)}
                    onRemove={() => removeLineItem(item.id)}
                    canRemove={lineItems.length > 1}
                  />
                ))}

                <div
                  style={{
                    marginTop: "0.5rem",
                    paddingTop: "0.625rem",
                    borderTop: "2px solid #0f172a",
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 700,
                    fontSize: "0.9375rem",
                  }}
                >
                  <span>รวมทุกรายการ</span>
                  <span style={{ color: "#16a34a" }}>฿{formatNumber(lineItemsTotal)}</span>
                </div>
              </div>
            )}

            {/* Smart Alerts: Budget + Duplicate */}
            {budgetAlert && <BudgetAlert alert={budgetAlert} />}
            {duplicates.length > 0 && (
              <DuplicateAlert duplicates={duplicates} events={events} payees={payees} />
            )}

            {/* ข้อมูลภาษีย้ายไปบันทึกค่าใช้จ่ายแล้ว — ตั้งเบิกใช้แค่ข้อมูลพื้นฐาน */}
            <div className="app-form-group" style={{ marginBottom: "0.75rem" }}>
              <label className="app-label" style={{ fontSize: "0.75rem" }}>ผู้ขออนุญาตเบิกจ่าย</label>
              <input
                type="text"
                value={form.requesterName}
                onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
                placeholder="ชื่อผู้เบิก"
                className="app-input"
                maxLength={100}
              />
            </div>

            <div className="app-form-group" style={{ marginBottom: 0 }}>
              <label className="app-label">หมายเหตุ</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="app-textarea"
                rows={2}
              />
            </div>
          </div>
        </div>

        <div className="app-modal-footer">
          <button onClick={onClose} disabled={isSaving} className="app-btn app-btn-secondary">
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave() || isSaving || ocrStatus === "processing"}
            className="app-btn app-btn-primary"
          >
            {isSaving ? (
              <>
                <span className="app-spinner" /> กำลังบันทึก...
              </>
            ) : splitMode === "multi" ? (
              `💾 บันทึก ${lineItems.length} รายการ (฿${formatNumber(lineItemsTotal)})`
            ) : (
              `💾 บันทึก${form.totalAmount > 0 ? ` (฿${formatNumber(netPayment)})` : ""}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Credit Badge =====
function CreditBadge({
  subscription,
  showUsed,
}: {
  subscription: {
    plan: string;
    creditsUsed: number;
    totalCredits: number;
    remainingCredits: number;
    percentageRemaining: number;
  } | null | undefined;
  showUsed: boolean;
}) {
  if (!subscription) return null;
  const pct = subscription.percentageRemaining;
  const color = pct <= 10 ? "#dc2626" : pct <= 30 ? "#d97706" : "#16a34a";
  const bg = pct <= 10 ? "#fef2f2" : pct <= 30 ? "#fffbeb" : "#f0fdf4";
  const border = pct <= 10 ? "#fecaca" : pct <= 30 ? "#fde68a" : "#bbf7d0";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.375rem 0.75rem",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: "9999px",
        fontSize: "0.75rem",
        color,
        fontWeight: 500,
      }}
    >
      <span>
        {showUsed && "✓ ใช้ 1 เครดิต • "}
        เหลือ <strong>{subscription.remainingCredits.toLocaleString()}</strong>/
        {subscription.totalCredits.toLocaleString()} ครั้ง
      </span>
    </div>
  );
}

// ===== Line Item Row =====
function LineItemRow({
  item,
  index,
  onUpdate,
  onRemove,
  canRemove,
}: {
  item: LineItem;
  index: number;
  onUpdate: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: "0.5rem",
        padding: "0.625rem",
        marginBottom: "0.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.375rem" }}>
        <span style={{ fontWeight: 600, fontSize: "0.75rem", color: "#64748b", minWidth: "1.25rem" }}>
          #{index + 1}
        </span>
        <input
          type="text"
          value={item.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="รายละเอียด เช่น ค่าอาหาร"
          className="app-input"
          style={{ flex: 1 }}
        />
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="app-btn app-btn-ghost app-btn-sm"
            style={{ color: "#dc2626" }}
          >
            ✕
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.375rem", alignItems: "end" }}>
        <div>
          <label style={{ fontSize: "0.6875rem", color: "#64748b" }}>ยอดเงิน</label>
          <input
            type="number"
            value={item.amount}
            onChange={(e) => onUpdate({ amount: parseFloat(e.target.value) || 0 })}
            min={0}
            step={0.01}
            className="app-input num"
          />
        </div>
        <div>
          <label style={{ fontSize: "0.6875rem", color: "#64748b" }}>หัก ณ ที่จ่าย</label>
          <SearchableSelect
            options={WTH_TYPES.map((t) => ({
              value: t.id,
              label: t.label,
            }))}
            value={item.wthTypeId}
            onChange={(val) => onUpdate({ wthTypeId: val })}
            className="app-select"
          />
        </div>
        <label className="app-checkbox" style={{ fontSize: "0.75rem" }}>
          <input
            type="checkbox"
            checked={item.hasVat}
            onChange={(e) => onUpdate({ hasVat: e.target.checked })}
          />
          VAT
        </label>
      </div>
    </div>
  );
}

// ===== Smart Alert Components =====

function BudgetAlert({
  alert,
}: {
  alert: {
    budget: number;
    spent: number;
    newAmount: number;
    afterSpent: number;
    remaining: number;
    pctBefore: number;
    pctAfter: number;
    isOver: boolean;
    isNearLimit: boolean;
  };
}) {
  const severity = alert.isOver ? "danger" : alert.isNearLimit ? "warning" : "info";
  const colors = {
    danger: { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b", icon: "🚨" },
    warning: { bg: "#fffbeb", border: "#fde68a", fg: "#92400e", icon: "⚠️" },
    info: { bg: "#eff6ff", border: "#bfdbfe", fg: "#1e40af", icon: "💰" },
  }[severity];

  return (
    <div
      style={{
        padding: "0.875rem 1rem",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "0.625rem",
        marginBottom: "1rem",
        fontSize: "0.8125rem",
        color: colors.fg,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "1rem" }}>{colors.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: "0.125rem" }}>
            {alert.isOver
              ? `เกินงบประมาณโปรเจกต์ — เกิน ฿${formatNumber(Math.abs(alert.remaining))}`
              : alert.isNearLimit
              ? `ใกล้เต็มงบประมาณ — เหลือ ฿${formatNumber(alert.remaining)} (${(100 - alert.pctAfter).toFixed(1)}%)`
              : `งบประมาณยังเหลือ ฿${formatNumber(alert.remaining)} (${(100 - alert.pctAfter).toFixed(1)}%)`}
          </div>
          <div
            style={{
              fontSize: "0.75rem",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.6,
            }}
          >
            งบ ฿{formatNumber(alert.budget)} • ใช้ไปแล้ว ฿{formatNumber(alert.spent)} ({alert.pctBefore.toFixed(1)}%)
            <br />
            + รายการนี้ ฿{formatNumber(alert.newAmount)} → ใช้รวม ฿{formatNumber(alert.afterSpent)} ({alert.pctAfter.toFixed(1)}%)
          </div>
        </div>
      </div>
      {/* Progress bar */}
      <div
        style={{
          height: "6px",
          background: "rgba(0,0,0,0.08)",
          borderRadius: "9999px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(alert.pctBefore, 100)}%`,
            background: colors.fg,
            opacity: 0.35,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${Math.min(alert.pctBefore, 100)}%`,
            height: "100%",
            width: `${Math.min(Math.max(alert.pctAfter - alert.pctBefore, 0), 100 - alert.pctBefore)}%`,
            background: colors.fg,
          }}
        />
      </div>
    </div>
  );
}

function DuplicateAlert({
  duplicates,
  events,
  payees,
}: {
  duplicates: Array<{
    paymentId: string;
    description: string;
    gttlAmount: number;
    createdAt: string;
    status: string;
    invoiceNumber: string;
    eventId: string;
    payeeId: string;
  }>;
  events: Event[];
  payees: Payee[];
}) {
  const eventMap = Object.fromEntries(events.map((e) => [e.eventId, e.eventName]));
  const payeeMap = Object.fromEntries(payees.map((p) => [p.payeeId, p.payeeName]));

  return (
    <div
      style={{
        padding: "0.875rem 1rem",
        background: "#fef3c7",
        border: "1px solid #fde68a",
        borderRadius: "0.625rem",
        marginBottom: "1rem",
        fontSize: "0.8125rem",
        color: "#92400e",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "1rem" }}>🔍</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>
            พบรายการที่คล้ายกัน {duplicates.length} รายการ — อาจเป็นรายการซ้ำ?
          </div>
          <div style={{ fontSize: "0.75rem", marginTop: "0.125rem", color: "#78350f" }}>
            ตรวจสอบก่อนบันทึกเพื่อป้องกันจ่ายซ้ำ
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gap: "0.375rem", marginTop: "0.5rem" }}>
        {duplicates.map((d) => {
          const date = d.createdAt ? new Date(d.createdAt) : null;
          return (
            <div
              key={d.paymentId}
              style={{
                padding: "0.5rem 0.625rem",
                background: "rgba(255,255,255,0.6)",
                borderRadius: "0.375rem",
                fontSize: "0.75rem",
                display: "flex",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: "#0f172a" }}>
                  {d.description || "—"}
                  {d.invoiceNumber && (
                    <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "0.375rem" }}>
                      • {d.invoiceNumber}
                    </span>
                  )}
                </div>
                <div style={{ color: "#64748b", fontSize: "0.6875rem" }}>
                  {payeeMap[d.payeeId] || "?"} • {eventMap[d.eventId] || "?"}
                  {date && ` • ${date.toLocaleDateString("th-TH", { day: "2-digit", month: "short" })}`}
                  {" • "}
                  <span
                    style={{
                      color:
                        d.status === "paid"
                          ? "#16a34a"
                          : d.status === "approved"
                          ? "#2563eb"
                          : "#92400e",
                    }}
                  >
                    {d.status === "paid"
                      ? "จ่ายแล้ว"
                      : d.status === "approved"
                      ? "อนุมัติแล้ว"
                      : "รอตรวจ"}
                  </span>
                </div>
              </div>
              <div style={{ fontWeight: 600, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
                ฿{formatNumber(d.gttlAmount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: color || "#475569" }}>{label}</span>
      <span style={{ color: color || "#0f172a", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
        {value < 0 ? "-" : ""}฿{formatNumber(Math.abs(value))}
      </span>
    </div>
  );
}

function findBestPayeeMatch(name: string, taxId: string | null, payees: Payee[]): Payee | null {
  if (taxId) {
    const byTax = payees.find((p) => p.taxId === taxId);
    if (byTax) return byTax;
  }
  const lower = name.toLowerCase().trim();
  const exact = payees.find((p) => p.payeeName.toLowerCase().trim() === lower);
  if (exact) return exact;
  const contain = payees.find(
    (p) => p.payeeName.toLowerCase().includes(lower) || lower.includes(p.payeeName.toLowerCase())
  );
  return contain || null;
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
