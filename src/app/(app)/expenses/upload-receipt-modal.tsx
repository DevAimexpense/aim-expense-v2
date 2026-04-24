"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { WTH_TYPES } from "@/lib/wth-types";
import {
  EXPENSE_CATEGORIES_MAIN,
  DOCUMENT_TYPE_OPTIONS,
  EXPENSE_NATURE_OPTIONS,
} from "@/lib/constants/expense-categories";
import { pdfFirstPageToImage, isPdfFile } from "@/lib/utils/pdf-to-image";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";
import { fireAutoGenDoc, resolveDocTypeForPayment } from "@/lib/utils/auto-gen-doc";

// ===== Types =====
interface Event { eventId: string; eventName: string; status: string }
interface Payee { payeeId: string; payeeName: string; taxId: string; isVAT: boolean; defaultWTH: number; bankName: string; bankAccount: string; address: string; phone: string }
interface ExtractedData {
  vendorName: string | null; vendorAddress: string | null; vendorTaxId: string | null; vendorBranch: string | null; vendorPhone: string | null;
  buyerName: string | null; buyerAddress: string | null; buyerTaxId: string | null; buyerBranch: string | null;
  invoiceNumber: string | null; documentType: string | null; documentDate: string | null; dueDate: string | null;
  subtotal: number | null; vatAmount: number | null; withholdingTax: number | null; totalAmount: number | null;
  hasVat: boolean; items: Array<{ description: string; quantity?: number; unitPrice?: number; amount: number }>; confidence: number; provider: string;
}
interface ValidationWarning { field: string; message: string; severity: "error" | "warning" | "info" }

type TabId = "header" | "items" | "payment";

// Payment row shape (from payment.list query)
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
export function UploadReceiptModal({ events, payees, onClose, onSuccess, attachToPayment }: {
  events: Event[]; payees: Payee[]; onClose: () => void; onSuccess: () => void;
  attachToPayment?: PaymentRow;
}) {
  const isAttachMode = !!attachToPayment;
  const utils = trpc.useUtils();
  const companyBanksQuery = trpc.companyBank.listForPayment.useQuery();
  const subscriptionQuery = trpc.subscription.current.useQuery();
  const masterBanksQuery = trpc.bank.list.useQuery();
  const companyBanks = companyBanksQuery.data || [];
  const subscription = subscriptionQuery.data;
  const masterBanks = masterBanksQuery.data || [];

  // Org data for buyer verification
  const orgQuery = trpc.org.get.useQuery();
  const orgData = orgQuery.data;

  const createPaymentMut = trpc.payment.create.useMutation();
  const updatePaymentMut = trpc.payment.update.useMutation();
  const recordReceiptMut = trpc.payment.recordReceipt.useMutation();
  const createPayeeMut = trpc.payee.create.useMutation();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("header");

  // Upload document type (selected BEFORE uploading file)
  const [uploadDocType, setUploadDocType] = useState<"receipt" | "tax_invoice" | "id_card">("receipt");

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "processing" | "done" | "failed">("idle");
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Local saving state ครอบคลุม save flow ทั้งหมด (รวม fetch upload) ป้องกัน double-click
  const [saving, setSaving] = useState(false);

  // Form — pre-fill from attachToPayment if in attach mode
  const [form, setForm] = useState(() => {
    const p = attachToPayment;
    return {
      eventId: p?.eventId || "", receiptNumber: p?.receiptNumber || "", documentDate: "",
      documentType: (p?.documentType === "receipt" || p?.documentType === "tax_invoice" ? p.documentType : "tax_invoice") as "" | "receipt" | "tax_invoice",
      vendorName: "", vendorTaxId: "", vendorAddress: "", vendorBranch: "", vendorPhone: "",
      buyerName: "", buyerTaxId: "", buyerAddress: "", buyerBranch: "",
      description: p?.description || "", subtotal: 0, vatAmount: p?.vatAmount || 0,
      totalAmount: p?.gttlAmount || 0, hasVat: (p?.vatAmount || 0) > 0,
      wthTypeId: "none", customWthRate: 0, wthAmount: p?.wthAmount || 0,
      expenseNature: (p?.expenseNature === "goods" || p?.expenseNature === "service" ? p.expenseNature : "") as "" | "goods" | "service",
      categoryMain: p?.categoryMain || "", categorySub: p?.categorySub || "",
      requesterName: p?.requesterName || "", notes: p?.notes || "",
      payeeId: p?.payeeId || "", createNewPayee: false, newPayeeBankName: "", newPayeeBankAccount: "",
      expenseType: (p?.expenseType || "account") as "team" | "account",
      companyBankId: p?.companyBankId || "", dueDate: p?.dueDate || todayISO(),
    };
  });

  // Defaults
  const meQuery = trpc.org.me.useQuery();
  useEffect(() => {
    if (!form.requesterName && meQuery.data?.displayName) setForm((p) => ({ ...p, requesterName: meQuery.data!.displayName }));
  }, [meQuery.data?.displayName]); // eslint-disable-line

  // Auto-fill buyer from org on mount (เปลี่ยนกลับ: Session 9 fix — OCR อ่านผิดบ่อย)
  // - ใน app นี้ ผู้ซื้อคือ org ของ user เอง → fill จาก org default
  // - ถ้า user upload เอกสารที่ผู้ซื้อไม่ตรงกับ org → แสดง warning (buyerCheck) ให้ user ตรวจ
  useEffect(() => {
    if (!orgData) return;
    setForm((p) => {
      // อย่า overwrite ถ้า user ติ๊กกรอกเองแล้ว
      if (p.buyerName || p.buyerTaxId || p.buyerAddress || p.buyerBranch) return p;
      return {
        ...p,
        buyerName: orgData.name || "",
        buyerTaxId: orgData.taxId || "",
        buyerAddress: orgData.address || "",
        buyerBranch: orgData.branchType === "HQ" ? "สำนักงานใหญ่" : orgData.branchNumber ? `สาขา ${orgData.branchNumber}` : "",
      };
    });
  }, [orgData]); // eslint-disable-line

  const selectedWth = WTH_TYPES.find((t) => t.id === form.wthTypeId) || WTH_TYPES[0];
  const effectiveWthRate = form.wthTypeId === "custom" ? form.customWthRate : selectedWth.rate;
  const wthAmount = (form.subtotal * effectiveWthRate) / 100;
  const netPayment = form.totalAmount - wthAmount;

  // File preview
  useEffect(() => {
    if (!file) { setFilePreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Auto-select default company bank
  useEffect(() => {
    if (form.expenseType !== "account" || form.companyBankId) return;
    const def = companyBanks.find((b) => b.isDefault);
    if (def) setForm((p) => ({ ...p, companyBankId: def.companyBankId }));
    else if (companyBanks.length === 1) setForm((p) => ({ ...p, companyBankId: companyBanks[0].companyBankId }));
  }, [companyBanks.length, form.expenseType]); // eslint-disable-line

  // ===== Buyer Verification =====
  const buyerCheck = useMemo(() => {
    if (!orgData || !extracted) return null;
    const checks: { field: string; match: boolean; orgVal: string; docVal: string }[] = [];
    if (orgData.name && form.buyerName) {
      // Normalize: NFC, merge ํ+า→ำ (Tesseract splits sara-am), strip zero-width, collapse spaces
      const norm = (s: string) => s.normalize("NFC").replace(/\u0E4D\u0E32/g, "\u0E33").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      const orgN = norm(orgData.name);
      const docN = norm(form.buyerName);
      checks.push({ field: "ชื่อ", match: orgN.includes(docN) || docN.includes(orgN), orgVal: orgData.name, docVal: form.buyerName });
    }
    if (orgData.taxId && form.buyerTaxId) {
      checks.push({ field: "เลขภาษี", match: orgData.taxId === form.buyerTaxId, orgVal: orgData.taxId, docVal: form.buyerTaxId });
    }
    return checks;
  }, [orgData, form.buyerName, form.buyerTaxId, extracted]);

  // ===== Validation Warnings =====
  const warnings: ValidationWarning[] = [];
  if (ocrStatus === "done" || ocrStatus === "failed") {
    if (!form.vendorTaxId && form.documentType === "tax_invoice") warnings.push({ field: "vendorTaxId", message: "ใบกำกับภาษีต้องมีเลขผู้เสียภาษีผู้ขาย", severity: "error" });
    if (form.vendorTaxId && form.vendorTaxId.length !== 13) warnings.push({ field: "vendorTaxId", message: `เลขผู้เสียภาษีผู้ขายไม่ครบ 13 หลัก (${form.vendorTaxId.length})`, severity: "error" });
    if (form.documentType === "tax_invoice" && !form.buyerTaxId) warnings.push({ field: "buyerTaxId", message: "ใบกำกับภาษีต้องมีเลขผู้เสียภาษีผู้ซื้อ", severity: "error" });
    if (!form.receiptNumber) warnings.push({ field: "receiptNumber", message: "ไม่พบเลขที่ใบเสร็จ/ใบกำกับภาษี", severity: "warning" });
    if (!form.documentDate) warnings.push({ field: "documentDate", message: "ไม่พบวันที่ออกเอกสาร", severity: "warning" });
    if (form.hasVat && form.subtotal > 0 && form.vatAmount > 0) {
      const exp = Math.round(form.subtotal * 0.07 * 100) / 100;
      if (Math.abs(exp - form.vatAmount) > 1) warnings.push({ field: "vatAmount", message: `VAT 7% คำนวณ (฿${fmtN(exp)}) ≠ ที่ระบุ (฿${fmtN(form.vatAmount)})`, severity: "warning" });
    }
    // Buyer mismatch
    if (buyerCheck) {
      const mismatches = buyerCheck.filter((c) => !c.match);
      mismatches.forEach((m) => warnings.push({ field: "buyer", message: `ข้อมูลผู้ซื้อ "${m.field}" ไม่ตรงกับองค์กร: เอกสาร="${m.docVal}" องค์กร="${m.orgVal}"`, severity: "warning" }));
    }
    if (!form.eventId) warnings.push({ field: "eventId", message: "ยังไม่ได้เลือกโปรเจกต์", severity: "warning" });
    if (!form.categoryMain) warnings.push({ field: "categoryMain", message: "ยังไม่ได้เลือกหมวดหมู่", severity: "info" });
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
    // Amount mismatch warning — create mode (ยอดเบิกต่ำผิดปกติ)
    if (!isAttachMode && form.totalAmount > 0 && form.totalAmount < 1) {
      warnings.push({ field: "totalAmount", message: "ยอดรวมต่ำกว่า ฿1 — ตรวจสอบว่าถูกต้อง", severity: "warning" });
    }
  }
  const errorWarnings = warnings.filter((w) => w.severity === "error");

  // ===== File handling =====
  const validateFile = (f: File): string | null => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(f.type)) return "รองรับเฉพาะ jpg, png, pdf";
    if (f.size > 10 * 1024 * 1024) return "ไฟล์ใหญ่เกิน 10 MB";
    return null;
  };
  const handleFileSelect = async (f: File) => {
    setError(null);
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setFile(f);
    await runOcr(f, "receipt");
  };

  const runOcr = async (f: File, docType: string = "receipt") => {
    setOcrStatus("processing");
    setError(null);
    try {
      // PDF → convert first page to image (like invoice modal)
      // This is CRITICAL because multi-page PDFs (e.g. receipt + ID card) confuse GPT
      // By sending only page 1 as image, GPT focuses on the receipt and reads buyer correctly
      let ocrFile: File = f;
      if (isPdfFile(f)) {
        try {
          ocrFile = await pdfFirstPageToImage(f, 2);
        } catch (pdfErr) {
          console.warn("PDF→image conversion failed, sending raw PDF:", pdfErr);
        }
      }
      const fd = new FormData();
      fd.append("file", ocrFile);
      fd.append("documentType", docType);
      const res = await fetch("/api/ocr/receipt", { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `OCR ล้มเหลว (${res.status})`); }
      const result = await res.json();
      const data = result.data as ExtractedData;
      setExtracted(data);

      // Receipt / Tax Invoice → fill all fields
      const matched = data.vendorName ? findBestPayeeMatch(data.vendorName, data.vendorTaxId, payees) : null;
      setForm((p) => ({
        ...p,
        receiptNumber: data.invoiceNumber || p.receiptNumber,
        documentDate: data.documentDate || p.documentDate,
        documentType: (data.documentType === "receipt" || data.documentType === "tax_invoice") ? data.documentType : p.documentType,
        vendorName: data.vendorName || p.vendorName, vendorTaxId: data.vendorTaxId || p.vendorTaxId,
        vendorAddress: data.vendorAddress || p.vendorAddress, vendorBranch: data.vendorBranch || p.vendorBranch,
        vendorPhone: data.vendorPhone || p.vendorPhone,
        // Buyer: ไม่ override ข้อมูล org (ผู้ซื้อส่วนใหญ่คือ org) — fill เฉพาะ field ที่ว่าง
        buyerName: p.buyerName || data.buyerName || "",
        buyerTaxId: p.buyerTaxId || data.buyerTaxId || "",
        buyerAddress: p.buyerAddress || data.buyerAddress || "",
        buyerBranch: p.buyerBranch || data.buyerBranch || "",
        description: p.description || buildDescription(data),
        subtotal: data.subtotal || p.subtotal, vatAmount: data.vatAmount || p.vatAmount,
        totalAmount: data.totalAmount || p.totalAmount, hasVat: data.hasVat,
        wthAmount: data.withholdingTax || p.wthAmount,
        payeeId: matched?.payeeId || p.payeeId, createNewPayee: !matched && !!data.vendorName,
        dueDate: data.dueDate || p.dueDate || todayISO(),
      }));
      utils.subscription.current.invalidate();
      setOcrStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "OCR ล้มเหลว — กรอกด้วยตนเอง");
      setOcrStatus("failed");
    }
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); };

  // ===== Save =====
  const canSave = (): boolean => {
    if (!form.eventId || form.totalAmount <= 0 || !form.receiptNumber.trim()) return false;
    if (form.createNewPayee ? !form.vendorName.trim() : !form.payeeId) return false;
    if (form.expenseType === "account" && !form.companyBankId) return false;
    return true;
  };

  const handleSave = async () => {
    if (saving) return; // ป้องกัน double-click
    setError(null);
    if (!canSave()) { setError("กรุณากรอกข้อมูลให้ครบ (โปรเจกต์, ผู้รับเงิน, เลขเอกสาร, ยอดรวม)"); return; }
    if (errorWarnings.length > 0) { setError(`มี ${errorWarnings.length} ข้อผิดพลาดที่ต้องแก้ไขก่อนบันทึก`); return; }
    setSaving(true);
    try {
      let payeeId = form.payeeId;
      if (form.createNewPayee) {
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
        documentType: form.documentType || undefined,
        expenseNature: form.expenseNature || undefined,
        categoryMain: form.categoryMain.trim() || undefined,
        categorySub: form.categorySub.trim() || undefined,
        requesterName: form.requesterName.trim() || undefined,
      };

      let paymentId: string;
      if (isAttachMode && attachToPayment) {
        // Attach mode: upload file + record receipt metadata (ใช้ recordReceipt — ไม่ผ่าน ownership gate)
        paymentId = attachToPayment.paymentId;
        // Upload file ก่อน → ดึง URL จาก response
        let uploadedReceiptUrl = "";
        if (file) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("paymentId", paymentId);
          fd.append("fileType", "receipt");
          if (form.receiptNumber.trim()) fd.append("invoiceNumber", form.receiptNumber.trim());
          // ส่ง receiptDate + description → backend จัด folder Year/Month + ชื่อไฟล์
          if (form.documentDate) fd.append("receiptDate", form.documentDate);
          if (form.description.trim()) fd.append("description", form.description.trim());
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
          receiptNumber: form.receiptNumber.trim() || undefined,
          receiptDate: form.documentDate || undefined,
        });
      } else {
        // Create mode: new payment — บันทึกค่าใช้จ่าย (จ่ายแล้ว มีใบเสร็จ) → ข้ามอนุมัติ
        const result = await createPaymentMut.mutateAsync({
          eventId: form.eventId, payeeId, expenseType: form.expenseType,
          companyBankId: form.companyBankId || undefined, invoiceNumber: form.receiptNumber.trim() || undefined,
          dueDate: form.dueDate, notes: form.notes.trim() || undefined,
          description: form.description.trim() || form.vendorName.trim() || "ค่าใช้จ่าย",
          costPerUnit: Math.round(costPerUnit * 100) / 100, days: 1, numberOfPeople: 1,
          pctWTH: effectiveWthRate, isVatPayee: form.hasVat,
          initialStatus: "paid",
          ...taxFields,
        });
        paymentId = result.paymentId;
      }

      // Upload receipt file (create mode only — attach mode already handled above)
      if (!isAttachMode && file && paymentId) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("paymentId", paymentId);
        fd.append("fileType", "receipt");
        fd.append("invoiceNumber", form.receiptNumber.trim());
        // ส่ง receiptDate + description → backend จัด folder Year/Month + ชื่อไฟล์
        if (form.documentDate) fd.append("receiptDate", form.documentDate);
        if (form.description.trim()) fd.append("description", form.description.trim());
        const upRes = await fetch("/api/payments/upload", { method: "POST", body: fd });
        if (!upRes.ok) {
          const d = await upRes.json().catch(() => ({}));
          throw new Error(d.error || "อัปโหลดไฟล์ไม่สำเร็จ");
        }
      }

      // Auto-generate + save PDF เอกสารระบบ (background, fire-and-forget)
      //   upload-receipt-modal: documentType ส่วนใหญ่เป็น "receipt" / "tax_invoice"
      //   ⇒ ถ้า WTH > 0 → wht-cert (เฉพาะกรณี้, substitute/voucher ไม่เกี่ยว)
      const wthAmountForGen = form.subtotal * effectiveWthRate / 100;
      const autoDocType = resolveDocTypeForPayment({
        wthAmount: wthAmountForGen,
        documentType: form.documentType,
      });
      if (autoDocType && paymentId) {
        console.log(`[upload-save] trigger auto-gen ${autoDocType} for ${paymentId} (delay 800ms for Sheets settle)`);
        // Delay 800ms ให้ Google Sheets settle read-after-write
        const pid = paymentId;
        const dt = autoDocType;
        setTimeout(() => fireAutoGenDoc(pid, dt), 800);
      }

      // ปิด modal ทันที แล้ว invalidate background — ให้ user feedback เร็ว
      onSuccess();
      utils.payment.list.invalidate();
      utils.payee.list.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  const isSaving = saving || createPaymentMut.isPending || updatePaymentMut.isPending || recordReceiptMut.isPending || createPayeeMut.isPending;

  // Tab definitions
  const tabs: { id: TabId; label: string; hasIssue: boolean }[] = [
    { id: "header", label: "ข้อมูลหัวบิล", hasIssue: warnings.some((w) => ["vendorTaxId", "buyerTaxId", "receiptNumber", "documentDate", "buyer"].includes(w.field)) },
    { id: "items", label: "รายการค่าใช้จ่าย", hasIssue: warnings.some((w) => ["categoryMain", "vatAmount"].includes(w.field)) },
    { id: "payment", label: "ข้อมูลการจ่าย", hasIssue: warnings.some((w) => ["eventId"].includes(w.field)) },
  ];

  return (
    <div className="app-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="app-modal" style={{ maxWidth: "min(1200px, 95vw)", maxHeight: "95vh" }}>
        {/* Header */}
        <div className="app-modal-header">
          <h3 className="app-modal-title">{isAttachMode ? "📎 แนบใบเสร็จ" : "🧾 อัปโหลดใบเสร็จ"}{ocrStatus === "processing" && <span style={{ marginLeft: "0.75rem", fontSize: "0.8125rem", color: "#2563eb" }}><span className="app-spinner" style={{ verticalAlign: "middle", marginRight: "0.375rem" }} />ระบบกำลังอ่าน...</span>}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <CreditBadge subscription={subscription} showUsed={ocrStatus === "done"} />
            <button onClick={onClose} className="app-btn app-btn-ghost app-btn-icon">✕</button>
          </div>
        </div>

        {/* Body: 2-column */}
        <div className="app-modal-body" style={{ padding: 0, display: "grid", gridTemplateColumns: file ? "1fr 1.3fr" : "1fr", gap: 0, minHeight: "500px", maxHeight: "calc(95vh - 140px)", overflow: "auto" }}>
          {/* LEFT: Preview */}
          {file && filePreviewUrl && (
            <div style={{ borderRight: "1px solid #e2e8f0", background: "#f8fafc", overflow: "auto", position: "relative" }}>
              {file.type === "application/pdf" ? (
                <iframe src={filePreviewUrl} style={{ width: "100%", height: "100%", minHeight: "500px", border: "none" }} title="Preview" />
              ) : (
                <div style={{ padding: "1rem", textAlign: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={filePreviewUrl} alt="Receipt" style={{ maxWidth: "100%", maxHeight: "calc(95vh - 200px)", objectFit: "contain", borderRadius: "0.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                </div>
              )}
              <button onClick={() => { setFile(null); setExtracted(null); setOcrStatus("idle"); }} style={{ position: "absolute", bottom: "0.75rem", left: "50%", transform: "translateX(-50%)", background: "white", border: "1px solid #e2e8f0", borderRadius: "0.375rem", padding: "0.375rem 0.75rem", fontSize: "0.75rem", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", color: "#dc2626" }}>✕ เลือกไฟล์ใหม่</button>
            </div>
          )}

          {/* RIGHT: Form with Tabs */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Top: Status + Project */}
            <div style={{ padding: "1rem 1.25rem 0", flexShrink: 0 }}>
              {error && <div className="app-error-msg" style={{ marginBottom: "0.5rem" }}>{error}</div>}

              {/* ⚠️ Amount mismatch warning — แสดงเด่นชัด */}
              {isAttachMode && attachToPayment && form.totalAmount > 0 && Math.abs(form.totalAmount - attachToPayment.gttlAmount) > 1 && (
                <div style={{
                  padding: "0.75rem 1rem",
                  background: "#fef2f2",
                  border: "2px solid #fecaca",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  color: "#991b1b",
                  marginBottom: "0.75rem",
                  fontWeight: 600,
                }}>
                  ⚠️ ยอดในใบเสร็จ (฿{fmtN(form.totalAmount)}) <b>ไม่ตรง</b> กับยอดที่จ่าย (฿{fmtN(attachToPayment.gttlAmount)}) — ต่างกัน ฿{fmtN(Math.abs(form.totalAmount - attachToPayment.gttlAmount))} — โปรดตรวจสอบ
                </div>
              )}

              {/* File upload */}
              {!file && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
                    style={{ border: isDragging ? "2px solid #3b82f6" : "2px dashed #cbd5e1", borderRadius: "0.75rem", padding: "1.25rem 1rem", textAlign: "center", background: isDragging ? "#eff6ff" : "#f8fafc", cursor: "pointer" }}
                    onClick={() => document.getElementById("receipt-file-input")?.click()}>
                    <div style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>📎</div>
                    <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#0f172a", margin: 0 }}>
                      แนบใบเสร็จ / ใบกำกับภาษี — ระบบอ่านให้อัตโนมัติ
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" }}>ลากวางหรือคลิก • jpg, png, pdf (สูงสุด 10 MB)</p>
                    <input id="receipt-file-input" type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} style={{ display: "none" }} />
                  </div>
                </div>
              )}

              {/* OCR status */}
              {ocrStatus === "processing" && <div style={{ padding: "0.75rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "0.5rem", fontSize: "0.8125rem", color: "#1e40af", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}><span className="app-spinner" />ระบบกำลังอ่านเอกสาร... (5-15 วินาที)</div>}

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

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: "auto", padding: "1rem 1.25rem" }}>

              {/* ===== TAB 1: ข้อมูลหัวบิล ===== */}
              {activeTab === "header" && (
                <div>
                  {/* Warnings for this tab */}
                  {warnings.filter((w) => ["vendorTaxId", "buyerTaxId", "receiptNumber", "documentDate", "buyer"].includes(w.field)).map((w, i) => (
                    <WarnBadge key={i} w={w} />
                  ))}

                  <SH title="📋 ข้อมูลเอกสาร" />
                  <div className="app-form-grid cols-2" style={{ gap: "0.5rem", marginBottom: "1rem" }}>
                    <FG label="เลขที่ใบเสร็จ / ใบกำกับภาษี *">
                      <input type="text" value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} placeholder="เช่น INV2026020002" className="app-input" />
                    </FG>
                    <FG label="วันที่ออกใบเสร็จ *">
                      <input type="date" value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} className="app-input" />
                    </FG>
                    <FG label="ประเภทเอกสาร">
                      <SearchableSelect
                        value={form.documentType}
                        onChange={(val) => setForm({ ...form, documentType: val as typeof form.documentType })}
                        className="app-select"
                        options={DOCUMENT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        emptyLabel="— ไม่ระบุ —"
                      />
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

                  <SH title="🏢 ผู้ขาย / ผู้ออกเอกสาร" />
                  <div style={{ marginBottom: "1rem" }}>
                    <FG label="ชื่อผู้ขาย *" full><input type="text" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} className="app-input" /></FG>
                    <div className="app-form-grid cols-2" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                      <FG label="เลขผู้เสียภาษี">
                        <input type="text" inputMode="numeric" value={form.vendorTaxId} onChange={(e) => setForm({ ...form, vendorTaxId: e.target.value.replace(/\D/g, "").slice(0, 13) })} placeholder="13 หลัก" className={`app-input mono ${form.vendorTaxId && form.vendorTaxId.length !== 13 ? "input-error" : ""}`} maxLength={13} />
                        {form.vendorTaxId && <TaxCount n={form.vendorTaxId.length} />}
                      </FG>
                      <FG label="สาขา"><input type="text" value={form.vendorBranch} onChange={(e) => setForm({ ...form, vendorBranch: e.target.value })} placeholder="สำนักงานใหญ่ / สาขา..." className="app-input" /></FG>
                    </div>
                    <FG label="ที่อยู่ผู้ขาย" style={{ marginTop: "0.5rem" }}><textarea value={form.vendorAddress} onChange={(e) => setForm({ ...form, vendorAddress: e.target.value })} rows={2} className="app-textarea" /></FG>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <SH title="🧑‍💼 ผู้ซื้อ (บริษัทเรา)" />
                    {orgData && !form.buyerName && (
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({
                          ...p,
                          buyerName: orgData.name || "",
                          buyerTaxId: orgData.taxId || "",
                          buyerAddress: orgData.address || "",
                          buyerBranch: orgData.branchType === "HQ" ? "สำนักงานใหญ่" : orgData.branchNumber ? `สาขา ${orgData.branchNumber}` : "",
                        }))}
                        className="app-btn app-btn-ghost app-btn-sm"
                        style={{ fontSize: "0.7rem", color: "#2563eb", marginBottom: "0.5rem" }}
                      >
                        🏢 เติมจากข้อมูลองค์กร
                      </button>
                    )}
                  </div>
                  {/* Buyer verification badge */}
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

                    {/* Amounts */}
                    <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e2e8f0" }}>
                      <div className="app-form-grid cols-2" style={{ gap: "0.5rem" }}>
                        <FG label="ยอดชำระ (รวม VAT) *">
                          <input type="number" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: parseFloat(e.target.value) || 0 })} min={0} step={0.01} className="app-input num" style={{ fontWeight: 600 }} />
                        </FG>
                        <FG label="ยอดรวมก่อนภาษี">
                          <input type="number" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: parseFloat(e.target.value) || 0 })} min={0} step={0.01} className="app-input num" />
                        </FG>
                      </div>
                      <div className="app-form-grid cols-2" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                        <FG label="ภาษีมูลค่าเพิ่ม (VAT)">
                          <input type="number" value={form.vatAmount} onChange={(e) => setForm({ ...form, vatAmount: parseFloat(e.target.value) || 0, hasVat: parseFloat(e.target.value) > 0 })} min={0} step={0.01} className="app-input num" />
                        </FG>
                        <FG label="ภาษีหัก ณ ที่จ่าย (WHT)">
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
                        </FG>
                      </div>
                    </div>
                  </div>

                  {/* OCR items (expandable) */}
                  {extracted && extracted.items.length > 0 && (
                    <details style={{ marginBottom: "0.75rem" }}>
                      <summary style={{ fontSize: "0.75rem", color: "#64748b", cursor: "pointer" }}>ℹ️ ดูรายการที่ระบบอ่านได้ ({extracted.items.length} รายการ)</summary>
                      <div style={{ marginTop: "0.375rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "0.375rem", padding: "0.5rem", fontSize: "0.75rem", maxHeight: "150px", overflow: "auto" }}>
                        {extracted.items.map((it, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0", borderBottom: "1px solid #f1f5f9" }}>
                            <span>{i + 1}. {it.description}</span>
                            <span style={{ fontWeight: 500 }}>฿{fmtN(it.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

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
                  <FG label="📝 หมายเหตุ" style={{ marginTop: "0.75rem" }}><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="app-textarea" rows={2} placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)" /></FG>
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
                    <FG label="📅 วันที่จ่าย / Due Date"><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="app-input" /></FG>
                    <FG label="ผู้ขออนุญาตเบิกจ่าย"><input type="text" value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} className="app-input" maxLength={100} /></FG>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="app-modal-footer">
          <button onClick={onClose} disabled={isSaving} className="app-btn app-btn-secondary">ยกเลิก</button>
          <button onClick={handleSave} disabled={!canSave() || isSaving || ocrStatus === "processing" || errorWarnings.length > 0} className="app-btn app-btn-primary">
            {isSaving ? <><span className="app-spinner" /> กำลังบันทึก...</> : <>{isAttachMode ? "📎 แนบใบเสร็จ" : "🧾 บันทึกใบเสร็จ"}{form.totalAmount > 0 ? ` (฿${fmtN(netPayment)})` : ""}</>}
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

function CreditBadge({ subscription, showUsed }: { subscription: { plan: string; creditsUsed: number; totalCredits: number; remainingCredits: number; percentageRemaining: number } | null | undefined; showUsed: boolean }) {
  if (!subscription) return null;
  const pct = subscription.percentageRemaining;
  const color = pct <= 10 ? "#dc2626" : pct <= 30 ? "#d97706" : "#16a34a";
  const bg = pct <= 10 ? "#fef2f2" : pct <= 30 ? "#fffbeb" : "#f0fdf4";
  const border = pct <= 10 ? "#fecaca" : pct <= 30 ? "#fde68a" : "#bbf7d0";
  return <div style={{ display: "inline-flex", alignItems: "center", padding: "0.375rem 0.75rem", background: bg, border: `1px solid ${border}`, borderRadius: "9999px", fontSize: "0.75rem", color, fontWeight: 500 }}>{showUsed && "✓ ใช้ 1 เครดิต • "}เหลือ <strong style={{ margin: "0 0.125rem" }}>{subscription.remainingCredits}</strong>/{subscription.totalCredits} ครั้ง</div>;
}

// ===== Helpers =====
function findBestPayeeMatch(name: string, taxId: string | null, payees: Payee[]): Payee | null {
  if (taxId) { const m = payees.find((p) => p.taxId === taxId); if (m) return m; }
  const l = name.toLowerCase().trim();
  return payees.find((p) => p.payeeName.toLowerCase().trim() === l) || payees.find((p) => p.payeeName.toLowerCase().includes(l) || l.includes(p.payeeName.toLowerCase())) || null;
}
function buildDescription(data: ExtractedData): string {
  const p: string[] = [];
  if (data.vendorName) p.push(data.vendorName);
  if (data.invoiceNumber) p.push(data.invoiceNumber);
  if (data.items.length === 1 && data.items[0].description) p.push(data.items[0].description);
  else if (data.items.length > 1) p.push(`${data.items.length} รายการ`);
  return p.join(" - ").slice(0, 200);
}
function fmtN(n: number): string { return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0); }
function todayISO(): string { return new Date().toISOString().slice(0, 10); }
