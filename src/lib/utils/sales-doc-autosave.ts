"use client";

// ===========================================
// บันทึก PDF เอกสารขายลง Drive อัตโนมัติ (ใบเสนอราคา / ใบวางบิล / ใบกำกับภาษี / ใบเสร็จ)
//
// หน้าเอกสาร (/documents/{kind}/{id}) เรียก useSalesDocAutoSave:
//   - ?auto=1 (iframe ซ่อนจากหน้ารายละเอียด) → สร้าง PDF + บันทึก + postMessage ผลกลับ parent
//   - เปิดดูปกติ → บันทึกเองถ้าไฟล์ใน Drive ยังไม่มี/เก่ากว่าข้อมูล (savedFor ≠ version)
// PDF สร้างด้วยวิธีเดียวกับปุ่ม "ดาวน์โหลด PDF" (html2canvas + jsPDF จาก .doc-page)
// ===========================================

import { useEffect, useState } from "react";

export type SalesDocKind = "quotation" | "billing" | "tax-invoice" | "receipt";

/** สร้าง PDF จากทุก .doc-page ในหน้า (A4) → Blob */
export async function buildDocPagesPdf(): Promise<Blob> {
  if ("fonts" in document) {
    await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
  }
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise<void>((r) => setTimeout(r, 300));

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const pages = Array.from(document.querySelectorAll(".doc-page"));
  if (pages.length === 0) throw new Error("ไม่พบเอกสารในหน้า");
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i] as HTMLElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, Math.min(imgHeight, pageHeight));
  }
  return pdf.output("blob");
}

/** กัน StrictMode/re-render สั่งซ้ำในหน้าเดียวกัน */
const started = new Set<string>();

export type SalesDocSaveState = "idle" | "saving" | "saved" | "error" | "skipped";

export function useSalesDocAutoSave(params: {
  kind: SalesDocKind;
  id: string;
  /** UpdatedAt ของข้อมูลที่หน้านี้ render */
  version: string;
  /** PdfFor ที่บันทึกไว้ล่าสุด (ว่าง = ยังไม่เคยบันทึก) */
  savedFor: string;
  /** ลิงก์ไฟล์ใน Drive ปัจจุบัน */
  savedUrl: string;
  /** CTRL-12: ลายนิ้วมือเนื้อหาของไฟล์ปัจจุบัน (ว่าง = ยังไม่เคยจด) */
  savedContentFor?: string;
  /** ร่าง → ไม่บันทึก */
  enabled: boolean;
}): { state: SalesDocSaveState; fileUrl: string; error: string } {
  const { kind, id, version, savedFor, savedUrl, savedContentFor, enabled } = params;
  const upToDate = !!savedUrl && !!savedFor && savedFor === version;
  const [state, setState] = useState<SalesDocSaveState>(upToDate ? "saved" : "idle");
  const [fileUrl, setFileUrl] = useState(savedUrl);
  const [error, setError] = useState("");

  useEffect(() => {
    const isAuto = new URLSearchParams(window.location.search).get("auto") === "1";
    const notifyParent = (success: boolean, info: { fileUrl?: string; error?: string }) => {
      if (isAuto && window.parent !== window) {
        try {
          window.parent.postMessage({ type: "doc-gen-result", success, ...info }, window.location.origin);
        } catch {
          /* ignore */
        }
      }
    };
    if (!enabled) {
      notifyParent(false, { error: "draft" });
      return;
    }
    if (upToDate) {
      notifyParent(true, { fileUrl: savedUrl });
      // CTRL-12: ไฟล์ตรงกับข้อมูลแต่ยังไม่มีลายนิ้วมือ (บันทึกก่อนมี CTRL-10) → ให้ server จดไว้
      // (ไม่สร้าง/อัปโหลดไฟล์) — การเปลี่ยนที่ไม่กระทบหน้าเอกสารครั้งแรกจะได้ไม่เกิด _v2
      const bfKey = `bf:${kind}:${id}:${version}`;
      if (!savedContentFor && !started.has(bfKey)) {
        started.add(bfKey);
        const fd = new FormData();
        fd.append("kind", kind);
        fd.append("id", id);
        fd.append("version", version);
        fd.append("backfill", "1");
        fetch("/api/documents/save-sales-pdf", { method: "POST", body: fd }).catch(() => {
          /* best-effort */
        });
      }
      return;
    }
    const key = `${kind}:${id}:${version}`;
    if (started.has(key)) return;
    started.add(key);

    (async () => {
      setState("saving");
      try {
        const blob = await buildDocPagesPdf();
        const fd = new FormData();
        fd.append("file", new File([blob], `${kind}-${id}.pdf`, { type: "application/pdf" }));
        fd.append("kind", kind);
        fd.append("id", id);
        fd.append("version", version);
        const res = await fetch("/api/documents/save-sales-pdf", { method: "POST", body: fd });
        const d = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          fileUrl?: string;
          error?: string;
          skipped?: string;
        };
        if (d.skipped) {
          setState("skipped");
          notifyParent(false, { error: d.skipped });
          return;
        }
        if (!res.ok || !d.success || !d.fileUrl) throw new Error(d.error || `HTTP ${res.status}`);
        setFileUrl(d.fileUrl);
        setState("saved");
        notifyParent(true, { fileUrl: d.fileUrl });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
        started.delete(key);
        setError(msg);
        setState("error");
        notifyParent(false, { error: msg });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, version, enabled]);

  return { state, fileUrl, error };
}
