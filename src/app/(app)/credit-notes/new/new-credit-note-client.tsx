"use client";

// SALE-02: ฟอร์มออกใบลดหนี้/ใบเพิ่มหนี้ — กรอก "มูลค่าที่ถูกต้อง (ก่อน VAT)" ระบบคิดผลต่าง + VAT ของผลต่าง
// พรีวิว = ค่าที่บันทึก (ใช้ computeNote ชุดเดียวกับ server)
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { todayBangkok, formatDate } from "@/lib/utils/date";
import DateInput from "@/components/shared/date-input";
import { computeNote, NOTE_TITLE, type NoteKind } from "@/lib/credit-note";

const formatTHB = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function NewCreditNoteClient({
  kind: initialKind,
  sourceType,
  sourceId,
}: {
  kind: NoteKind;
  sourceType: "tax_invoice" | "receipt";
  sourceId: string;
}) {
  const router = useRouter();
  const info = trpc.creditNote.sourceInfo.useQuery({ sourceType, sourceId }, { enabled: !!sourceId, retry: false });
  const createMut = trpc.creditNote.create.useMutation();
  const [kind, setKind] = useState<NoteKind>(initialKind);
  const [docDate, setDocDate] = useState(todayBangkok());
  const [correct, setCorrect] = useState<string>("");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const calc = useMemo(() => {
    if (!info.data || correct.trim() === "") return null;
    return computeNote({
      kind,
      originalSubtotal: info.data.originalSubtotal,
      prior: info.data.prior,
      correctSubtotal: parseFloat(correct),
    });
  }, [info.data, kind, correct]);

  if (!sourceId) {
    return <div className="app-page">ไม่ระบุใบกำกับภาษีที่จะอ้างถึง — เปิดจากหน้าใบกำกับภาษี</div>;
  }
  if (info.isLoading) return <div className="app-page">กำลังโหลด...</div>;
  if (info.error || !info.data) {
    return (
      <div className="app-page">
        <div className="app-error-msg">{info.error?.message || "ไม่พบเอกสาร"}</div>
        <Link href="/credit-notes" className="app-btn app-btn-secondary">
          ← กลับ
        </Link>
      </div>
    );
  }
  const d = info.data;
  const reasons = kind === "credit" ? d.creditReasons : d.debitReasons;

  const submit = async () => {
    setError(null);
    if (!calc || !calc.ok) {
      setError(calc && !calc.ok ? calc.error : "กรุณากรอกมูลค่าที่ถูกต้อง");
      return;
    }
    if (!reasonCode) return setError("กรุณาเลือกเหตุ");
    if (reason.trim().length < 3) return setError("กรุณาอธิบายเหตุ (จะพิมพ์บนเอกสาร)");
    if (!window.confirm(`ออก${NOTE_TITLE[kind]} ผลต่าง ${formatTHB(calc.diff)} บาท + VAT ${formatTHB(calc.vat)} บาท?\nออกแล้วแก้ไม่ได้ (ยกเลิกได้ — เลขที่ไม่กลับมาใช้)`)) return;
    try {
      const res = await createMut.mutateAsync({
        kind,
        sourceType,
        sourceId,
        docDate,
        correctSubtotal: parseFloat(correct),
        reasonCode,
        reason: reason.trim(),
        description: description.trim() || undefined,
      });
      if (res.warning) alert(`⚠️ ${res.warning}`);
      window.open(`/documents/credit-note/${res.noteId}`, "_blank", "noopener");
      router.push("/credit-notes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div className="app-page" style={{ maxWidth: 760 }}>
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">↩️ ออก{NOTE_TITLE[kind]}</h1>
          <p className="app-page-subtitle">
            อ้างใบกำกับภาษี {d.docNumber} ลงวันที่ {formatDate(d.docDate)} · {d.customerName}
          </p>
        </div>
        <Link href="/credit-notes" className="app-btn app-btn-secondary">
          ← กลับ
        </Link>
      </div>

      {error && <div className="app-error-msg">{error}</div>}

      <div className="app-card" style={{ display: "grid", gap: "0.875rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(["credit", "debit"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`app-btn ${kind === k ? "app-btn-primary" : "app-btn-secondary"}`}
              onClick={() => {
                setKind(k);
                setReasonCode("");
              }}
            >
              {NOTE_TITLE[k]}
            </button>
          ))}
        </div>

        <div style={{ fontSize: "0.875rem", background: "#f8fafc", padding: "0.75rem", borderRadius: "0.5rem", lineHeight: 1.7 }}>
          <div>มูลค่าตามใบกำกับเดิม (ก่อน VAT): <strong>{formatTHB(d.originalSubtotal)}</strong> บาท</div>
          {d.prior !== 0 && (
            <div>
              ปรับไปแล้วโดยใบลด/เพิ่มหนี้ก่อนหน้า: <strong>{formatTHB(d.prior)}</strong> บาท → มูลค่าปัจจุบัน{" "}
              <strong>{formatTHB(d.currentValue)}</strong> บาท
            </div>
          )}
        </div>

        <div className="app-form-grid cols-2" style={{ gap: "0.75rem" }}>
          <div className="app-form-group">
            <label className="app-label app-label-required">วันที่ออก (งวดภาษีที่{kind === "credit" ? "ลด" : "เพิ่ม"}ภาษีขาย)</label>
            <DateInput value={docDate} onChange={setDocDate} className="app-input" />
          </div>
          <div className="app-form-group">
            <label className="app-label app-label-required">มูลค่าที่ถูกต้อง (ก่อน VAT)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={correct}
              onChange={(e) => setCorrect(e.target.value)}
              className="app-input num"
              placeholder={formatTHB(d.currentValue)}
            />
          </div>
        </div>

        {calc && (
          <div
            style={{
              fontSize: "0.875rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: calc.ok ? "#f0fdf4" : "#fef2f2",
              color: calc.ok ? "#166534" : "#991b1b",
            }}
          >
            {calc.ok ? (
              <>
                ผลต่าง <strong>{formatTHB(calc.diff)}</strong> + ภาษีมูลค่าเพิ่ม 7% <strong>{formatTHB(calc.vat)}</strong> = รวม{" "}
                <strong>{formatTHB(calc.total)}</strong> บาท ({kind === "credit" ? "ลด" : "เพิ่ม"}ภาษีขายเดือน {docDate.slice(0, 7)})
              </>
            ) : (
              calc.error
            )}
          </div>
        )}

        <div className="app-form-group">
          <label className="app-label app-label-required">เหตุ (ตามกฎหมาย)</label>
          <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className="app-select">
            <option value="">— เลือก —</option>
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="app-form-group">
          <label className="app-label app-label-required">คำอธิบาย (พิมพ์บนเอกสาร)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="app-input"
            placeholder={kind === "credit" ? "เช่น สินค้าชำรุด 2 ชิ้น ลูกค้าส่งคืน" : "เช่น ส่งมอบเพิ่ม 5 ชิ้นตามที่ลูกค้าขอ"}
            maxLength={500}
          />
        </div>
        <div className="app-form-group">
          <label className="app-label">รายการที่{kind === "credit" ? "ลด" : "เพิ่ม"} (ถ้ามี)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="app-input"
            maxLength={500}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="app-btn app-btn-primary" onClick={submit} disabled={createMut.isPending}>
            {createMut.isPending ? "กำลังออก…" : `ออก${NOTE_TITLE[kind]}`}
          </button>
        </div>
      </div>

      {d.notes.length > 0 && (
        <div className="app-card" style={{ marginTop: "1rem", fontSize: "0.875rem" }}>
          <strong>ใบลด/เพิ่มหนี้ของใบกำกับนี้</strong>
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
            {d.notes.map((n) => (
              <li key={n.noteId}>
                {n.docNumber} ({n.title}) {formatDate(n.docDate)} · ผลต่าง {formatTHB(n.diffAmount)}
                {n.status === "void" ? " · ยกเลิกแล้ว" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
