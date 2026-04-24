"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { WTH_TYPES } from "@/lib/wth-types";
import {
  EXPENSE_CATEGORIES_MAIN,
  EXPENSE_NATURE_OPTIONS,
} from "@/lib/constants/expense-categories";
import { pdfFirstPageToImage, isPdfFile } from "@/lib/utils/pdf-to-image";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";
import { fireAutoGenDoc, resolveDocTypeForPayment } from "@/lib/utils/auto-gen-doc";

// ===== Types =====
interface Event { eventId: string; eventName: string; status: string }
interface Payee { payeeId: string; payeeName: string; taxId: string; isVAT: boolean; defaultWTH: number; bankName: string; bankAccount: string; address: string; phone: string }
interface ValidationWarning { field: string; message: string; severity: "error" | "warning" | "info" }

type TabId = "header" | "items" | "payment";
type NoReceiptDocType = "id_card" | "substitute_receipt";

// Document type options for no-receipt flow
const NO_RECEIPT_DOC_TYPES: { value: NoReceiptDocType; label: string; description: string }[] = [
  { value: "id_card", label: "📄 สำเนาบัตรประชาชน", description: "ใช้สำเนาบัตรประชาชนเป็นเอกสารประกอบ" },
  { value: "substitute_receipt", label: "📋 ใบรับรองแทนใบเสร็จรับเงิน", description: "ออกใบรับรองแทนการรับเงิน" },
];

// Payment row shape (for attach mode)
interface PaymentRow {
  paymentId: string; eventId: string; payeeId: string; expenseType: "team" | "account";
  companyBankId: string; invoiceNumber: string; description: string;
  costPerUnit: number; days: number; numberOfPeople: number;
  ttlAmount: number; pctWTH: number; wthAmount: number; vatAmount: number; gttlAmount: number;
  status: string; dueDate: string; receiptUrl: string; receiptNumber: string;
  documentType: string; expenseNature: string; categoryMain: string; categorySub: string;
  requesterName: string; notes: string;
  [key: string]: unknown;
}

// ===== Component =====
export function ManualReceiptModal({ events, payees, onClose, onSuccess, attachToPayment }: {
  events: Event[]; payees: Payee[]; onClose: () => void; onSuccess: () => void;
  attachToPayment?: PaymentRow;
}) {
  const isAttachMode = !!attachToPayment;
  const utils = trpc.useUtils();
  const companyBanksQuery = trpc.companyBank.listForPayment.useQuery();
  const masterBanksQuery = trpc.bank.list.useQuery();
  const companyBanks = companyBanksQuery.data || [];
  const masterBanks = masterBanksQuery.data || [];

  // Org data for buyer auto-fill
  const orgQuery = trpc.org.get.useQuery();
  const orgData = orgQuery.data;

  const createPaymentMut = trpc.payment.create.useMutation();
  const updatePaymentMut = trpc.payment.update.useMutation();
  const recordReceiptMut = trpc.payment.recordReceipt.useMutation();
  const createPayeeMut = trpc.payee.create.useMutation();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("header");
  const [error, setError] = useState<string | null>(null);
  // Local saving state ครอบคลุม save flow ทั้งหมด (รวม fetch upload)
  // เพื่อ disable button ตลอด ป้องกัน user click ซ้ำ
  const [saving, setSaving] = useState(false);

  // ID card upload
  const [idCardFile, setIdCardFile] = useState<File | null>(null); // เก็บไฟล์ไว้เพื่อ upload ไป Google Drive ตอน save
  const [idCardStatus, setIdCardStatus] = useState<"idle" | "processing" | "done" | "failed">("idle");
  const subscriptionQuery = trpc.subscription.current.useQuery();

  const handleIdCardUpload = async (f: File) => {
    setError(null);
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(f.type)) { setError("รองรับเฉพาะ jpg, png, pdf"); return; }
    if (f.size > 10 * 1024 * 1024) { setError("ไฟล์ใหญ่เกิน 10 MB"); return; }
    setIdCardStatus("processing");
    setIdCardFile(f); // เก็บไฟล์ต้นฉบับไว้ upload ตอน save
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
      // Fill vendor (ผู้ขาย) from ID card
      setForm((p) => ({
        ...p,
        vendorName: data.vendorName || p.vendorName,
        vendorTaxId: data.vendorTaxId || p.vendorTaxId,
        vendorAddress: data.vendorAddress || p.vendorAddress,
      }));
      // Also check if payee exists and auto-select
      if (data.vendorName) {
        const matched = payees.find((py) =>
          (data.vendorTaxId && py.taxId === data.vendorTaxId) ||
          py.payeeName.toLowerCase().includes(data.vendorName.toLowerCase())
        );
        if (matched) {
          setForm((p) => ({ ...p, payeeId: matched.payeeId, createNewPayee: false }));
        } else {
          setForm((p) => ({ ...p, createNewPayee: true, payeeId: "" }));
        }
      }
      subscriptionQuery.refetch();
      setIdCardStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านบัตรประชาชนไม่สำเร็จ");
      setIdCardStatus("failed");
    }
  };

  // Form — ไม่มีใบเสร็จ flow (pre-fill from attachToPayment if in attach mode)
  const [form, setForm] = useState(() => {
    const p = attachToPayment;
    // ถ้า attach mode: คำนวน subtotal จาก gttl + vat (กลับกันจาก auto-calc)
    const gttl = p?.gttlAmount || 0;
    const vat = p?.vatAmount || 0;
    const initialSubtotal = gttl > 0 ? Math.round((gttl - vat) * 100) / 100 : 0;
    return {
      eventId: p?.eventId || "", documentDate: todayISO(),
      documentType: "id_card" as NoReceiptDocType,
      vendorName: "", vendorTaxId: "", vendorAddress: "", vendorBranch: "", vendorPhone: "",
      buyerName: "", buyerTaxId: "", buyerAddress: "", buyerBranch: "",
      description: p?.description || "",
      subtotal: initialSubtotal,
      vatAmount: vat,
      totalAmount: gttl,
      hasVat: vat > 0,
      wthTypeId: "none", customWthRate: 0, wthAmount: p?.wthAmount || 0,
      expenseNature: (p?.expenseNature === "goods" || p?.expenseNature === "service" ? p.expenseNature : "") as "" | "goods" | "service",
      categoryMain: p?.categoryMain || "", categorySub: p?.categorySub || "",
      requesterName: p?.requesterName || "", notes: p?.notes || "",
      payeeId: p?.payeeId || "", createNewPayee: false, newPayeeBankName: "", newPayeeBankAccount: "",
      expenseType: (p?.expenseType || "account") as "team" | "account",
      companyBankId: p?.companyBankId || "", dueDate: p?.dueDate || todayISO(),
    };
  });

  // When documentType is substitute_receipt → force WHT to none
  useEffect(() => {
    if (form.documentType === "substitute_receipt" && form.wthTypeId !== "none") {
      setForm((p) => ({ ...p, wthTypeId: "none", customWthRate: 0 }));
    }
  }, [form.documentType]); // eslint-disable-line

  // Auto-calc VAT + ยอดรวม จาก subtotal + hasVat
  // (เฉพาะเมื่อ subtotal > 0 เพื่อป้องกัน overwrite ค่า initial จาก attach mode)
  useEffect(() => {
    const vat = form.hasVat && form.subtotal > 0 ? Math.round(form.subtotal * 0.07 * 100) / 100 : 0;
    const total = Math.round((form.subtotal + vat) * 100) / 100;
    setForm((p) => {
      if (p.vatAmount === vat && p.totalAmount === total) return p;
      return { ...p, vatAmount: vat, totalAmount: total };
    });
  }, [form.subtotal, form.hasVat]);

  // Defaults — requester name
  const meQuery = trpc.org.me.useQuery();
  useEffect(() => {
    if (!form.requesterName && meQuery.data?.displayName) setForm((p) => ({ ...p, requesterName: meQuery.data!.displayName }));
  }, [meQuery.data?.displayName]); // eslint-disable-line

  // Auto-fill buyer from org data
  useEffect(() => {
    if (orgData && !form.buyerName) {
      setForm((p) => ({
        ...p,
        buyerName: orgData.name || "",
        buyerTaxId: orgData.taxId || "",
        buyerAddress: orgData.address || "",
        buyerBranch: orgData.branchType === "HQ" ? "สำนักงานใหญ่" : orgData.branchNumber ? `สาขา ${orgData.branchNumber}` : "",
      }));
    }
  }, [orgData]); // eslint-disable-line

  const selectedWth = WTH_TYPES.find((t) => t.id === form.wthTypeId) || WTH_TYPES[0];
  const effectiveWthRate = form.wthTypeId === "custom" ? form.customWthRate : selectedWth.rate;
  const wthAmount = (form.subtotal * effectiveWthRate) / 100;
  const netPayment = form.totalAmount - wthAmount;

  // Auto-select default company bank
  useEffect(() => {
    if (form.expenseType !== "account" || form.companyBankId) return;
    const def = companyBanks.find((b) => b.isDefault);
    if (def) setForm((p) => ({ ...p, companyBankId: def.companyBankId }));
    else if (companyBanks.length === 1) setForm((p) => ({ ...p, companyBankId: companyBanks[0].companyBankId }));
  }, [companyBanks.length, form.expenseType]); // eslint-disable-line

  // ===== Buyer Verification =====
  const buyerCheck = useMemo(() => {
    if (!orgData) return null;
    const checks: { field: string; match: boolean; orgVal: string; docVal: string }[] = [];
    if (orgData.name && form.buyerName) {
      const norm = (s: string) => s.normalize("NFC").replace(/\u0E4D\u0E32/g, "\u0E33").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      const orgN = norm(orgData.name);
      const docN = norm(form.buyerName);
      checks.push({ field: "ชื่อ", match: orgN.includes(docN) || docN.includes(orgN), orgVal: orgData.name, docVal: form.buyerName });
    }
    if (orgData.taxId && form.buyerTaxId) {
      checks.push({ field: "เลขภาษี", match: orgData.taxId === form.buyerTaxId, orgVal: orgData.taxId, docVal: form.buyerTaxId });
    }
    return checks;
  }, [orgData, form.buyerName, form.buyerTaxId]);

  // ===== Auto-generate document indicator =====
  const generatedDocument = useMemo(() => {
    if (form.documentType === "substitute_receipt") {
      return { icon: "📋", label: "ใบรับรองแทนการรับเงิน", color: "#7c3aed" };
    }
    // id_card
    if (form.wthTypeId !== "none") {
      return { icon: "📑", label: "หนังสือรับรองหัก ณ ที่จ่าย", color: "#2563eb" };
    }
    return { icon: "🧾", label: "ใบสำคัญรับเงิน", color: "#059669" };
  }, [form.documentType, form.wthTypeId]);

  // ===== Validation Warnings =====
  const warnings: ValidationWarning[] = [];
  if (form.documentType === "id_card" && !form.vendorTaxId) warnings.push({ field: "vendorTaxId", message: "สำเนาบัตรประชาชน ควรมีเลขผู้เสียภาษีผู้ขาย", severity: "warning" });
  if (form.vendorTaxId && form.vendorTaxId.length !== 13) warnings.push({ field: "vendorTaxId", message: `เลขผู้เสียภาษีผู้ขายไม่ครบ 13 หลัก (${form.vendorTaxId.length})`, severity: "error" });
  if (!form.documentDate) warnings.push({ field: "documentDate", message: "ไม่พบวันที่ออกเอกสาร", severity: "warning" });
  if (form.hasVat && form.subtotal > 0 && form.vatAmount > 0) {
    const exp = Math.round(form.subtotal * 0.07 * 100) / 100;
    if (Math.abs(exp - form.vatAmount) > 1) warnings.push({ field: "vatAmount", message: `VAT 7% คำนวณ (฿${fmtN(exp)}) ≠ ที่ระบุ (฿${fmtN(form.vatAmount)})`, severity: "warning" });
  }
  if (buyerCheck) {
    const mismatches = buyerCheck.filter((c) => !c.match);
    mismatches.forEach((m) => warnings.push({ field: "buyer", message: `ข้อมูลผู้ซื้อ "${m.field}" ไม่ตรงกับองค์กร: กรอก="${m.docVal}" องค์กร="${m.orgVal}"`, severity: "warning" }));
  }
  if (!form.eventId) warnings.push({ field: "eventId", message: "ยังไม่ได้เลือกโปรเจกต์", severity: "warning" });
  if (!form.categoryMain) warnings.push({ field: "categoryMain", message: "ยังไม่ได้เลือกหมวดหมู่", severity: "info" });
  if (!form.vendorName) warnings.push({ field: "vendorName", message: "ยังไม่ได้กรอกชื่อผู้ขาย", severity: "warning" });
  // Amount mismatch warning — เตือนยอดเบิกไม่ตรงกับยอดใบเสร็จ (attach mode)
  if (isAttachMode && attachToPayment && form.totalAmount > 0) {
    const origAmount = attachToPayment.gttlAmount;
    const diff = Math.abs(form.totalAmount - origAmount);
    if (diff > 1) {
      warnings.push({
        field: "totalAmount",
        message: `⚠️ ยอดใบเสร็จ (฿${fmtN(form.totalAmount)}) ≠ ยอดเบิก (฿${fmtN(origAmount)}) — ต่างกัน ฿${fmtN(diff)}`,
        severity: "warning",
      });
    }
  }

  const errorWarnings = warnings.filter((w) => w.severity === "error");

  // ===== Save =====
  const canSave = (): boolean => {
    if (!form.eventId || form.totalAmount <= 0 || !form.vendorName.trim()) return false;
    if (form.createNewPayee ? !form.vendorName.trim() : !form.payeeId) return false;
    if (form.expenseType === "account" && !form.companyBankId) return false;
    return true;
  };

  const handleSave = async () => {
    if (saving) return; // ป้องกัน double-click
    setError(null);
    if (!canSave()) { setError("กรุณากรอกข้อมูลให้ครบ (โปรเจกต์, ผู้รับเงิน, ชื่อผู้ขาย, ยอดรวม)"); return; }
    if (errorWarnings.length > 0) { setError(`มี ${errorWarnings.length} ข้อผิดพลาดที่ต้องแก้ไขก่อนบันทึก`); return; }
    setSaving(true);
    let step = "เริ่มต้น";
    try {
      step = "prepare";
      console.log("[manual-save] start", { isAttachMode, hasIdCardFile: !!idCardFile });
      let payeeId = form.payeeId;
      if (form.createNewPayee) {
        step = "createPayee";
        const p = await createPayeeMut.mutateAsync({
          payeeName: form.vendorName.trim(), taxId: form.vendorTaxId.trim() || undefined,
          address: form.vendorAddress.trim() || undefined, phone: form.vendorPhone.trim() || undefined,
          bankName: form.newPayeeBankName.trim() || undefined, bankAccount: form.newPayeeBankAccount.trim() || undefined,
          isVAT: form.hasVat, defaultWTH: effectiveWthRate,
        });
        payeeId = p.payeeId;
      }
      const costPerUnit = form.hasVat ? form.totalAmount / 1.07 : form.totalAmount;
      const taxFields = {
        documentType: form.documentType || undefined, expenseNature: form.expenseNature || undefined,
        categoryMain: form.categoryMain.trim() || undefined, categorySub: form.categorySub.trim() || undefined,
        requesterName: form.requesterName.trim() || undefined,
      };

      let paymentId: string;
      if (isAttachMode && attachToPayment) {
        // Attach mode: ใช้ recordReceipt (ไม่ผ่าน ownership gate) — upload file + metadata เท่านั้น
        paymentId = attachToPayment.paymentId;
        // Upload ID card file ถ้ามี → ดึง URL จาก response
        let uploadedReceiptUrl = "";
        if (idCardFile) {
          const fd = new FormData();
          fd.append("file", idCardFile);
          fd.append("paymentId", paymentId);
          fd.append("fileType", "receipt");
          // ส่ง receiptDate + description → backend จัด folder Year/Month + ชื่อไฟล์
          if (form.documentDate) fd.append("receiptDate", form.documentDate);
          const desc = form.description.trim() || form.vendorName.trim();
          if (desc) fd.append("description", desc);
          const upRes = await fetch("/api/payments/upload", { method: "POST", body: fd });
          if (!upRes.ok) {
            const d = await upRes.json().catch(() => ({}));
            throw new Error(d.error || "อัปโหลดไฟล์ไม่สำเร็จ");
          }
          const upData = await upRes.json();
          uploadedReceiptUrl = upData.fileUrl || upData.url || "";
        }
        // Record receipt metadata + URL via recordReceipt (no ownership gate)
        await recordReceiptMut.mutateAsync({
          paymentId,
          receiptUrl: uploadedReceiptUrl || undefined,
          receiptNumber: undefined,
          receiptDate: form.documentDate || undefined,
        });
      } else {
        // Create mode: new payment — บันทึกค่าใช้จ่าย (ไม่มีใบเสร็จ) → ข้ามอนุมัติ
        step = "createPayment";
        const result = await createPaymentMut.mutateAsync({
          eventId: form.eventId, payeeId, expenseType: form.expenseType,
          companyBankId: form.companyBankId || undefined,
          dueDate: form.dueDate, notes: form.notes.trim() || undefined,
          description: form.description.trim() || form.vendorName.trim() || "ค่าใช้จ่าย",
          costPerUnit: Math.round(costPerUnit * 100) / 100, days: 1, numberOfPeople: 1,
          pctWTH: effectiveWthRate, isVatPayee: form.hasVat,
          initialStatus: "paid",
          ...taxFields,
        });
        paymentId = result.paymentId;
        console.log("[manual-save] created paymentId=", paymentId);
      }
      // Upload ID card file ไป Google Drive (create mode)
      if (!isAttachMode && idCardFile && paymentId) {
        step = "uploadIdCard";
        const fd = new FormData();
        fd.append("file", idCardFile);
        fd.append("paymentId", paymentId);
        fd.append("fileType", "receipt");
        // ส่ง receiptDate + description → backend จัด folder Year/Month + ชื่อไฟล์
        if (form.documentDate) fd.append("receiptDate", form.documentDate);
        const desc = form.description.trim() || form.vendorName.trim();
        if (desc) fd.append("description", desc);
        const upRes = await fetch("/api/payments/upload", { method: "POST", body: fd });
        if (!upRes.ok) {
          const d = await upRes.json().catch(() => ({}));
          throw new Error(d.error || "อัปโหลดไฟล์ไม่สำเร็จ");
        }
      }
      step = "closeModal";
      console.log("[manual-save] done, closing modal");

      // Auto-generate + save PDF เอกสารระบบ (background, fire-and-forget)
      //   - WTH > 0 → wht-cert
      //   - documentType = substitute_receipt → substitute-receipt
      //   - documentType = id_card → receipt-voucher
      const wthAmountForGen = (form.subtotal * effectiveWthRate) / 100;
      const autoDocType = resolveDocTypeForPayment({
        wthAmount: wthAmountForGen,
        documentType: form.documentType,
      });
      if (autoDocType && paymentId) {
        console.log(`[manual-save] trigger auto-gen ${autoDocType} for ${paymentId} (delay 800ms for Sheets settle)`);
        // Delay 800ms ให้ Google Sheets settle read-after-write (กัน iframe get 404 จาก getById)
        const pid = paymentId;
        const dt = autoDocType;
        setTimeout(() => fireAutoGenDoc(pid, dt), 800);
      }

      // ปิด modal ทันที แล้ว invalidate background — ให้ user feedback เร็วขึ้น
      onSuccess();
      utils.payment.list.invalidate();
      utils.payee.list.invalidate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
      console.error(`[manual-save] FAILED at step="${step}":`, e);
      setError(`[${step}] ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const isSaving = saving || createPaymentMut.isPending || updatePaymentMut.isPending || recordReceiptMut.isPending || createPayeeMut.isPending;

  // Tab definitions
  const tabs: { id: TabId; label: string; hasIssue: boolean }[] = [
    { id: "header", label: "ข้อมูลเอกสาร", hasIssue: warnings.some((w) => ["vendorTaxId", "vendorName", "documentDate", "buyer"].includes(w.field)) },
    { id: "items", label: "รายการค่าใช้จ่าย", hasIssue: warnings.some((w) => ["categoryMain", "vatAmount"].includes(w.field)) },
    { id: "payment", label: "ข้อมูลการจ่าย", hasIssue: warnings.some((w) => ["eventId"].includes(w.field)) },
  ];

  return (
    <div className="app-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="app-modal" style={{ maxWidth: "720px", maxHeight: "95vh" }}>
        {/* Header */}
        <div className="app-modal-header">
          <h3 className="app-modal-title">{isAttachMode ? "📎 แนบเอกสาร (ไม่มีใบเสร็จ)" : "📝 ไม่มีใบเสร็จ"}</h3>
          <button onClick={onClose} className="app-btn app-btn-ghost app-btn-icon">✕</button>
        </div>

        {/* Body */}
        <div className="app-modal-body" style={{ padding: 0, display: "flex", flexDirection: "column", maxHeight: "calc(95vh - 140px)" }}>
          {/* Top: Status + Project + Tabs */}
          <div style={{ padding: "1rem 1.25rem 0", flexShrink: 0 }}>
            {error && <div className="app-error-msg" style={{ marginBottom: "0.5rem" }}>{error}</div>}

            {/* Auto-generate document indicator */}
            <div style={{ marginBottom: "0.75rem", padding: "0.625rem 0.875rem", borderRadius: "0.5rem", background: `${generatedDocument.color}10`, border: `1px solid ${generatedDocument.color}30`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.125rem" }}>{generatedDocument.icon}</span>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>ระบบจะออกเอกสาร:</div>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: generatedDocument.color }}>{generatedDocument.label}</div>
              </div>
            </div>

            {/* Project selector (PROMINENT) */}
            <div style={{ marginBottom: "0.75rem" }}>
              <label className="app-label app-label-required" style={{ fontSize: "0.8125rem", fontWeight: 700 }}>🎯 โปรเจกต์</label>
              <SearchableSelect
                value={form.eventId}
                onChange={(val) => setForm({ ...form, eventId: val })}
                className="app-select"
                style={{ fontWeight: 500 }}
                options={events.filter((e) => e.status !== "cancelled").map((e) => ({ value: e.eventId, label: e.eventName }))}
                emptyLabel="— เลือกโปรเจกต์ —"
              />
            </div>

            {/* Tab Navigation */}
            <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0", gap: "0" }}>
              {tabs.map((t) => (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                  style={{ padding: "0.625rem 1rem", fontSize: "0.8125rem", fontWeight: activeTab === t.id ? 700 : 400, color: activeTab === t.id ? "#2563eb" : "#64748b", background: "none", border: "none", borderBottom: activeTab === t.id ? "2px solid #2563eb" : "2px solid transparent", marginBottom: "-2px", cursor: "pointer", position: "relative" }}>
                  {t.label}
                  {t.hasIssue && <span style={{ position: "absolute", top: "4px", right: "2px", width: "6px", height: "6px", borderRadius: "50%", background: "#dc2626" }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content — scrollable */}
          <div style={{ flex: 1, overflow: "auto", padding: "1rem 1.25rem" }}>

            {/* ===== TAB 1: ข้อมูลเอกสาร ===== */}
            {activeTab === "header" && (
              <div>
                {warnings.filter((w) => ["vendorTaxId", "vendorName", "documentDate", "buyer"].includes(w.field)).map((w, i) => (
                  <WarnBadge key={i} w={w} />
                ))}

                <SH title="📋 ประเภทเอกสาร" />
                <div style={{ marginBottom: "1rem" }}>
                  {/* Document type selector — radio card style */}
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                    {NO_RECEIPT_DOC_TYPES.map((dt) => (
                      <button key={dt.value} type="button" onClick={() => setForm({ ...form, documentType: dt.value })}
                        style={{
                          flex: 1, padding: "0.75rem", borderRadius: "0.5rem", cursor: "pointer", textAlign: "left",
                          background: form.documentType === dt.value ? "#eff6ff" : "#fff",
                          border: `2px solid ${form.documentType === dt.value ? "#2563eb" : "#e2e8f0"}`,
                          transition: "all 0.15s ease",
                        }}>
                        <div style={{ fontWeight: 600, fontSize: "0.8125rem", color: form.documentType === dt.value ? "#1d4ed8" : "#334155", marginBottom: "0.25rem" }}>{dt.label}</div>
                        <div style={{ fontSize: "0.6875rem", color: "#94a3b8" }}>{dt.description}</div>
                      </button>
                    ))}
                  </div>

                  <div className="app-form-grid cols-2" style={{ gap: "0.5rem" }}>
                    <FG label="วันที่เอกสาร *">
                      <input type="date" value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} className="app-input" />
                    </FG>
                    <FG label="ค่าใช้จ่ายเป็น">
                      <SearchableSelect
                        value={form.expenseNature}
                        onChange={(val) => setForm({ ...form, expenseNature: val as typeof form.expenseNature })}
                        className="app-select"
                        options={EXPENSE_NATURE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        emptyLabel="— ไม่ระบุ —"
                      />
                    </FG>
                  </div>
                </div>

                <SH title="🏢 ผู้ขาย / ผู้รับเงิน" />
                {/* ID card upload — show when documentType is id_card */}
                {form.documentType === "id_card" && (
                  <label
                    style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.625rem 0.875rem", marginBottom: "0.75rem",
                      border: "1px dashed #a78bfa", borderRadius: "0.5rem",
                      background: idCardStatus === "done" ? "#f0fdf4" : "#faf5ff",
                      cursor: idCardStatus === "processing" ? "wait" : "pointer",
                      fontSize: "0.8125rem", color: idCardStatus === "done" ? "#166534" : "#6d28d9",
                      transition: "all 150ms",
                    }}
                  >
                    {idCardStatus === "processing" ? (
                      <><span className="app-spinner" style={{ width: "14px", height: "14px" }} /> กำลังอ่านบัตรประชาชน...</>
                    ) : idCardStatus === "done" ? (
                      <>✅ อ่านบัตรประชาชนแล้ว — ข้อมูลถูกเติมด้านล่าง</>
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
                )}
                <div style={{ marginBottom: "1rem" }}>
                  <FG label="ชื่อผู้ขาย *" full><input type="text" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} className="app-input" placeholder="ชื่อบุคคล หรือ บริษัท" /></FG>
                  <div className="app-form-grid cols-2" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                    <FG label="เลขผู้เสียภาษี / เลขบัตรประชาชน">
                      <input type="text" inputMode="numeric" value={form.vendorTaxId} onChange={(e) => setForm({ ...form, vendorTaxId: e.target.value.replace(/\D/g, "").slice(0, 13) })} placeholder="13 หลัก" className={`app-input mono ${form.vendorTaxId && form.vendorTaxId.length !== 13 ? "input-error" : ""}`} maxLength={13} />
                      {form.vendorTaxId && <TaxCount n={form.vendorTaxId.length} />}
                    </FG>
                    <FG label="สาขา"><input type="text" value={form.vendorBranch} onChange={(e) => setForm({ ...form, vendorBranch: e.target.value })} placeholder="สำนักงานใหญ่ / สาขา..." className="app-input" /></FG>
                  </div>
                  <FG label="ที่อยู่ผู้ขาย" style={{ marginTop: "0.5rem" }}><textarea value={form.vendorAddress} onChange={(e) => setForm({ ...form, vendorAddress: e.target.value })} rows={2} className="app-textarea" /></FG>
                  <FG label="เบอร์โทรผู้ขาย" style={{ marginTop: "0.5rem" }}><input type="text" value={form.vendorPhone} onChange={(e) => setForm({ ...form, vendorPhone: e.target.value })} placeholder="02-xxx-xxxx" className="app-input" /></FG>
                </div>

                <SH title="🧑‍💼 ผู้ซื้อ (บริษัทเรา)" />
                {buyerCheck && buyerCheck.length > 0 && (
                  <div style={{ marginBottom: "0.5rem", padding: "0.5rem 0.75rem", borderRadius: "0.375rem", fontSize: "0.75rem",
                    background: buyerCheck.every((c) => c.match) ? "#f0fdf4" : "#fffbeb",
                    border: `1px solid ${buyerCheck.every((c) => c.match) ? "#bbf7d0" : "#fde68a"}`,
                    color: buyerCheck.every((c) => c.match) ? "#166534" : "#92400e" }}>
                    {buyerCheck.every((c) => c.match)
                      ? "✅ ข้อมูลผู้ซื้อตรงกับข้อมูลองค์กร"
                      : `⚠️ ข้อมูลผู้ซื้อไม่ตรงกับองค์กร: ${buyerCheck.filter((c) => !c.match).map((c) => c.field).join(", ")}`}
                  </div>
                )}
                <div style={{ marginBottom: "0.5rem" }}>
                  <FG label="ชื่อผู้ซื้อ" full><input type="text" value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} className="app-input" /></FG>
                  <div className="app-form-grid cols-2" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                    <FG label="เลขผู้เสียภาษี">
                      <input type="text" inputMode="numeric" value={form.buyerTaxId} onChange={(e) => setForm({ ...form, buyerTaxId: e.target.value.replace(/\D/g, "").slice(0, 13) })} placeholder="13 หลัก" className={`app-input mono ${form.buyerTaxId && form.buyerTaxId.length !== 13 ? "input-error" : ""}`} maxLength={13} />
                      {form.buyerTaxId && <TaxCount n={form.buyerTaxId.length} />}
                    </FG>
                    <FG label="สาขา"><input type="text" value={form.buyerBranch} onChange={(e) => setForm({ ...form, buyerBranch: e.target.value })} placeholder="สำนักงานใหญ่ / สาขา..." className="app-input" /></FG>
                  </div>
                  <FG label="ที่อยู่ผู้ซื้อ" style={{ marginTop: "0.5rem" }}><textarea value={form.buyerAddress} onChange={(e) => setForm({ ...form, buyerAddress: e.target.value })} rows={2} className="app-textarea" /></FG>
                </div>
              </div>
            )}

            {/* ===== TAB 2: รายการค่าใช้จ่าย ===== */}
            {activeTab === "items" && (
              <div>
                {warnings.filter((w) => ["categoryMain", "vatAmount"].includes(w.field)).map((w, i) => <WarnBadge key={i} w={w} />)}

                {/* Item card */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "0.625rem", padding: "1rem", marginBottom: "1rem", background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "#1e293b" }}>#1 {form.description ? form.description.slice(0, 40) + (form.description.length > 40 ? "..." : "") : "รายการค่าใช้จ่าย"}</span>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#2563eb" }}>฿{fmtN(form.totalAmount)}</span>
                  </div>

                  <FG label="รายละเอียด *" full>
                    <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="เช่น ค่าที่พัก Grande Centre Point..." className="app-input" />
                  </FG>

                  <div className="app-form-grid cols-2" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                    <FG label="ประเภท *">
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <label className="app-checkbox" style={{ fontSize: "0.8125rem" }}><input type="radio" name="nature" checked={form.expenseNature === "goods"} onChange={() => setForm({ ...form, expenseNature: "goods" })} /> สินค้า</label>
                        <label className="app-checkbox" style={{ fontSize: "0.8125rem" }}><input type="radio" name="nature" checked={form.expenseNature === "service"} onChange={() => setForm({ ...form, expenseNature: "service" })} /> บริการ</label>
                      </div>
                    </FG>
                    <FG label="จำนวน"><input type="number" value={1} readOnly className="app-input num" /></FG>
                  </div>

                  <div className="app-form-grid cols-2" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                    <FG label="หมวดหมู่ *">
                      <SearchableSelect
                        value={form.categoryMain}
                        onChange={(val) => setForm({ ...form, categoryMain: val })}
                        className="app-select"
                        options={EXPENSE_CATEGORIES_MAIN.map((c) => ({ value: c, label: c }))}
                        emptyLabel="— เลือก —"
                      />
                    </FG>
                    <FG label="หมวดหมู่ย่อย">
                      <input type="text" value={form.categorySub} onChange={(e) => setForm({ ...form, categorySub: e.target.value })} placeholder="เช่น ที่พัก, อาหาร" className="app-input" />
                    </FG>
                  </div>

                  {/* Amounts — user กรอกแค่ยอดก่อนภาษี + ติ๊ก VAT → ระบบคำนวน VAT + ยอดรวมให้ */}
                  <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e2e8f0" }}>
                    <div className="app-form-grid cols-2" style={{ gap: "0.5rem" }}>
                      <FG label="ยอดรวมก่อนภาษี *">
                        <input
                          type="number"
                          value={form.subtotal || ""}
                          onChange={(e) => setForm({ ...form, subtotal: parseFloat(e.target.value) || 0 })}
                          min={0}
                          step={0.01}
                          className="app-input num"
                          style={{ fontWeight: 600 }}
                          placeholder="0.00"
                        />
                      </FG>
                      <FG label="ผู้รับเงินเป็น VAT?">
                        <label
                          className="app-checkbox"
                          style={{
                            fontSize: "0.8125rem",
                            padding: "0.5rem 0.75rem",
                            border: "1px solid #e2e8f0",
                            borderRadius: "0.375rem",
                            background: form.hasVat ? "#eff6ff" : "#fff",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.375rem",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={form.hasVat}
                            onChange={(e) => setForm({ ...form, hasVat: e.target.checked })}
                          />
                          <span style={{ fontWeight: form.hasVat ? 600 : 400, color: form.hasVat ? "#1d4ed8" : "#64748b" }}>จด VAT 7%</span>
                        </label>
                      </FG>
                    </div>
                    <div className="app-form-grid cols-2" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                      <FG label="ภาษีมูลค่าเพิ่ม (คำนวณอัตโนมัติ)">
                        <input
                          type="text"
                          value={fmtN(form.vatAmount || 0)}
                          readOnly
                          className="app-input num"
                          style={{ background: "#f8fafc", cursor: "not-allowed", color: "#64748b" }}
                        />
                      </FG>
                      <FG label="ยอดชำระ (รวม VAT)">
                        <input
                          type="text"
                          value={fmtN(form.totalAmount || 0)}
                          readOnly
                          className="app-input num"
                          style={{ background: "#f0fdf4", cursor: "not-allowed", fontWeight: 700, color: "#15803d" }}
                        />
                      </FG>
                    </div>
                    <div style={{ marginTop: "0.5rem" }}>
                      <FG label="ภาษีหัก ณ ที่จ่าย (WHT)">
                        {form.documentType === "substitute_receipt" ? (
                          <div style={{ padding: "0.5rem 0.75rem", background: "#f1f5f9", borderRadius: "0.375rem", fontSize: "0.8125rem", color: "#64748b" }}>
                            ไม่สามารถเลือกได้ (ใบรับรองแทนฯ)
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "0.375rem" }}>
                            <SearchableSelect
                              value={form.wthTypeId}
                              onChange={(val) => setForm({ ...form, wthTypeId: val })}
                              className="app-select"
                              style={{ flex: 1 }}
                              options={WTH_TYPES.map((t) => ({ value: t.id, label: t.label }))}
                            />
                            {form.wthTypeId === "custom" && (
                              <input type="number" value={form.customWthRate} onChange={(e) => setForm({ ...form, customWthRate: parseFloat(e.target.value) || 0 })} min={0} max={100} step={0.5} className="app-input num" style={{ width: "5rem" }} />
                            )}
                          </div>
                        )}
                      </FG>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <SH title="สรุปรวมค่าใช้จ่าย" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", padding: "0.75rem", background: "#f8fafc", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
                  <SumBox label="ยอดชำระ" value={form.totalAmount} unit="THB" />
                  <SumBox label="ยอดรวมก่อนภาษี" value={form.subtotal} unit="THB" />
                  <SumBox label="ภาษีมูลค่าเพิ่ม (VAT)" value={form.vatAmount} unit="THB" />
                  <SumBox label="ภาษีหัก ณ ที่จ่าย (WHT)" value={wthAmount} unit="THB" />
                </div>
                {netPayment !== form.totalAmount && netPayment > 0 && (
                  <div style={{ marginTop: "0.5rem", textAlign: "right", fontWeight: 700, color: "#16a34a", fontSize: "0.9375rem" }}>
                    ยอดจ่ายจริง: ฿{fmtN(netPayment)}
                  </div>
                )}

                {/* Notes */}
                <FG label="หมายเหตุ" style={{ marginTop: "0.75rem" }}><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="app-textarea" rows={2} placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)" /></FG>
              </div>
            )}

            {/* ===== TAB 3: ข้อมูลการจ่ายเงิน ===== */}
            {activeTab === "payment" && (
              <div>
                {warnings.filter((w) => ["eventId"].includes(w.field)).map((w, i) => <WarnBadge key={i} w={w} />)}

                <FG label="ประเภทรายจ่าย *" style={{ marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" onClick={() => setForm({ ...form, expenseType: "account" })} className={`app-btn ${form.expenseType === "account" ? "app-btn-primary" : "app-btn-secondary"}`} style={{ flex: 1 }}>🏦 โอนบัญชี</button>
                    <button type="button" onClick={() => setForm({ ...form, expenseType: "team", companyBankId: "" })} className={`app-btn ${form.expenseType === "team" ? "app-btn-primary" : "app-btn-secondary"}`} style={{ flex: 1 }}>💵 เบิกเงินสด</button>
                  </div>
                </FG>

                {form.expenseType === "account" && (
                  <FG label="บัญชีต้นทาง *" style={{ marginBottom: "0.75rem" }}>
                    {companyBanks.length === 0 ? (
                      <div style={{ padding: "0.5rem", background: "#fef3c7", borderRadius: "0.375rem", fontSize: "0.75rem", color: "#854d0e" }}>⚠️ ยังไม่มีบัญชีบริษัท — <a href="/settings/org" target="_blank" style={{ textDecoration: "underline" }}>ไปเพิ่ม</a></div>
                    ) : (
                      <SearchableSelect
                        value={form.companyBankId}
                        onChange={(val) => setForm({ ...form, companyBankId: val })}
                        className="app-select"
                        options={companyBanks.map((b) => ({ value: b.companyBankId, label: `${b.bankName} ${b.accountNumber}${b.isDefault ? " ⭐" : ""}` }))}
                        emptyLabel="— เลือก —"
                      />
                    )}
                  </FG>
                )}

                <FG label="👤 ผู้รับเงิน *" style={{ marginBottom: "0.75rem" }}>
                  {form.createNewPayee ? (
                    <div style={{ padding: "0.625rem", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "0.375rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <span style={{ fontWeight: 600, color: "#9a3412", fontSize: "0.75rem" }}>✨ Payee ใหม่: {form.vendorName || "—"}</span>
                        <button type="button" onClick={() => setForm({ ...form, createNewPayee: false })} className="app-btn app-btn-ghost app-btn-sm" style={{ fontSize: "0.7rem" }}>เลือกจากรายการ</button>
                      </div>
                      <div className="app-form-grid cols-2" style={{ gap: "0.375rem" }}>
                        <SearchableSelect
                          value={form.newPayeeBankName}
                          onChange={(val) => setForm({ ...form, newPayeeBankName: val, newPayeeBankAccount: val === "เงินสด" ? "" : form.newPayeeBankAccount })}
                          className="app-select"
                          options={[{ value: "เงินสด", label: "💵 เงินสด" }, ...masterBanks.map((b) => ({ value: b.bankName, label: b.bankName }))]}
                          emptyLabel="— ธนาคาร —"
                        />
                        {form.newPayeeBankName !== "เงินสด" && (
                          <input type="text" value={form.newPayeeBankAccount} onChange={(e) => setForm({ ...form, newPayeeBankAccount: e.target.value })} placeholder="เลขบัญชี" className="app-input mono" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <SearchableSelect
                        value={form.payeeId}
                        onChange={(val) => setForm({ ...form, payeeId: val })}
                        className="app-select"
                        style={{ flex: 1 }}
                        options={payees.map((p) => ({ value: p.payeeId, label: `${p.payeeName}${p.isVAT ? " (VAT)" : ""}` }))}
                        emptyLabel="— เลือก —"
                      />
                      <button type="button" onClick={() => setForm({ ...form, createNewPayee: true, payeeId: "" })} className="app-btn app-btn-secondary app-btn-sm">+ ใหม่</button>
                    </div>
                  )}
                </FG>

                <div className="app-form-grid cols-2" style={{ gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <FG label="วันที่จ่าย / Due Date"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="app-input" /></FG>
                  <FG label="ผู้ขออนุญาตเบิกจ่าย"><input type="text" value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} className="app-input" maxLength={100} /></FG>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="app-modal-footer">
          <button onClick={onClose} disabled={isSaving} className="app-btn app-btn-secondary">ยกเลิก</button>
          <button onClick={handleSave} disabled={!canSave() || isSaving || errorWarnings.length > 0} className="app-btn app-btn-primary">
            {isSaving ? <><span className="app-spinner" /> กำลังบันทึก...</> : <>{isAttachMode ? "📎 แนบเอกสาร" : "📝 บันทึก"}{form.totalAmount > 0 ? ` (฿${fmtN(netPayment)})` : ""}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Sub-components =====
function SH({ title }: { title: string }) {
  return <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1e293b", margin: "0 0 0.5rem", paddingBottom: "0.375rem", borderBottom: "2px solid #e2e8f0" }}>{title}</p>;
}

function FG({ label, children, full, style }: { label: string; children: React.ReactNode; full?: boolean; style?: React.CSSProperties }) {
  return (
    <div className="app-form-group" style={{ marginBottom: 0, ...(full ? { gridColumn: "1 / -1" } : {}), ...style }}>
      <label className="app-label" style={{ fontSize: "0.75rem" }}>{label}</label>
      {children}
    </div>
  );
}

function TaxCount({ n }: { n: number }) {
  return <span style={{ fontSize: "0.65rem", color: n === 13 ? "#16a34a" : "#dc2626" }}>{n}/13 หลัก</span>;
}

function WarnBadge({ w }: { w: ValidationWarning }) {
  const colors = { error: { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b", icon: "❌" }, warning: { bg: "#fffbeb", border: "#fde68a", fg: "#92400e", icon: "⚠️" }, info: { bg: "#eff6ff", border: "#bfdbfe", fg: "#1e40af", icon: "ℹ️" } };
  const c = colors[w.severity];
  return <div style={{ padding: "0.5rem 0.75rem", borderRadius: "0.375rem", fontSize: "0.8125rem", background: c.bg, border: `1px solid ${c.border}`, color: c.fg, marginBottom: "0.375rem" }}>{c.icon} {w.message}</div>;
}

function SumBox({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.6875rem", color: "#64748b", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {fmtN(value)} <span style={{ fontSize: "0.6875rem", color: "#94a3b8", fontWeight: 400 }}>{unit}</span>
      </div>
    </div>
  );
}

// ===== Helpers =====
function fmtN(n: number): string { return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0); }
function todayISO(): string { return new Date().toISOString().slice(0, 10); }
