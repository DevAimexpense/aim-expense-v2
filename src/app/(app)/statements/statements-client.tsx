"use client";

// ===========================================
// Statement ธนาคารรายเดือน — เลือกเดือน → เห็นทุกบัญชีของบริษัทว่าอัปโหลดแล้วหรือยัง
// ไฟล์ไปอยู่ที่ Google Drive: Reports/{ปี}/{เดือน}/ — แชร์โฟลเดอร์ Reports ให้สำนักงานบัญชีครั้งเดียว
// ===========================================

import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { formatDate } from "@/lib/utils/date";

const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTHS_TH_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const OTHER = "__other__";

/** statement มักออกหลังสิ้นเดือน → ค่าเริ่มต้น = เดือนที่แล้ว (เวลาไทย) */
function previousMonth(): { year: number; month: number } {
  const now = new Date(Date.now() + 7 * 3600_000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11 = เดือนปัจจุบัน → เดือนก่อน = m (1-based m)
  return m === 0 ? { year: y - 1, month: 12 } : { year: y, month: m };
}

type Statement = {
  statementId: string;
  month: string;
  companyBankId: string;
  bankLabel: string;
  fileName: string;
  fileUrl: string;
  monthFolderUrl: string;
  notes: string;
  uploadedBy: string;
  uploadedByUserId: string;
  uploadedAt: string;
};

export function StatementsClient({ isAdmin, userId }: { isAdmin: boolean; userId: string }) {
  const init = previousMonth();
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [uploading, setUploading] = useState<string>("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otherLabel, setOtherLabel] = useState("");

  const utils = trpc.useUtils();
  const q = trpc.statement.list.useQuery({ year }, { refetchOnWindowFocus: false });
  const deleteMut = trpc.statement.delete.useMutation();

  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const banks = q.data?.banks ?? [];
  const byMonth = useMemo(() => {
    const map = new Map<string, Statement[]>();
    for (const s of q.data?.statements ?? []) {
      const list = map.get(s.month) ?? [];
      list.push(s);
      map.set(s.month, list);
    }
    return map;
  }, [q.data]);
  const monthRows = byMonth.get(ym) ?? [];
  const monthFolderUrl = monthRows.find((r) => r.monthFolderUrl)?.monthFolderUrl ?? "";
  const otherRows = monthRows.filter((r) => !r.companyBankId);

  /** จำนวนบัญชีที่มี statement แล้วในเดือนนั้น / ทั้งหมด */
  const coverage = (key: string) => {
    const rows = byMonth.get(key) ?? [];
    const done = banks.filter((b) => rows.some((r) => r.companyBankId === b.companyBankId)).length;
    return { done, total: banks.length, files: rows.length };
  };

  const upload = async (files: FileList | null, companyBankId: string) => {
    if (!files || files.length === 0) return;
    if (companyBankId === OTHER && !otherLabel.trim()) {
      setError("กรุณาระบุชื่อบัญชี/ธนาคาร ก่อนอัปโหลด statement ของบัญชีอื่น");
      return;
    }
    setError(null);
    setNotice(null);
    setUploading(companyBankId);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("month", ym);
        fd.append("companyBankId", companyBankId === OTHER ? "" : companyBankId);
        if (companyBankId === OTHER) fd.append("bankLabel", otherLabel.trim());
        const res = await fetch("/api/statements/upload", { method: "POST", body: fd });
        const d = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; fileName?: string };
        if (!res.ok || !d.success) throw new Error(`${file.name}: ${d.error || "อัปโหลดไม่สำเร็จ"}`);
      }
      setNotice(`อัปโหลดแล้ว ${files.length} ไฟล์ → Google Drive โฟลเดอร์ Reports/${year}/${String(month).padStart(2, "0")}`);
      await utils.statement.list.invalidate({ year });
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading("");
    }
  };

  const remove = async (s: Statement) => {
    if (!window.confirm(`ลบ ${s.fileName}?\nไฟล์ใน Google Drive จะถูกย้ายไปถังขยะ (กู้คืนได้ใน 30 วัน)`)) return;
    setError(null);
    try {
      await deleteMut.mutateAsync({ statementId: s.statementId });
      await utils.statement.list.invalidate({ year });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  };

  const fileList = (rows: Statement[]) =>
    rows.length === 0 ? null : (
      <ul style={{ listStyle: "none", padding: 0, margin: "0.375rem 0 0", display: "grid", gap: "0.25rem" }}>
        {rows.map((s) => (
          <li key={s.statementId} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.8125rem", flexWrap: "wrap" }}>
            <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1" }}>
              📄 {s.fileName}
            </a>
            <span style={{ color: "#94a3b8" }}>
              {s.uploadedBy ? `${s.uploadedBy} · ` : ""}
              {s.uploadedAt ? formatDate(s.uploadedAt) : ""}
            </span>
            {(isAdmin || s.uploadedByUserId === userId) && (
              <button
                type="button"
                onClick={() => remove(s)}
                disabled={deleteMut.isPending}
                className="app-btn app-btn-ghost app-btn-sm"
                style={{ color: "#dc2626", padding: "0 0.375rem" }}
                aria-label={`ลบ ${s.fileName}`}
              >
                ลบ
              </button>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">🏦 Statement ธนาคาร</h1>
          <p className="app-page-subtitle">
            อัปโหลด statement ทุกบัญชีทุกเดือน — เก็บใน Google Drive โฟลเดอร์ Reports/ปี/เดือน พร้อมส่งสำนักงานบัญชี
          </p>
        </div>
        {q.data?.reportsFolderUrl && (
          <a href={q.data.reportsFolderUrl} target="_blank" rel="noopener noreferrer" className="app-btn app-btn-secondary">
            📁 เปิดโฟลเดอร์ Reports
          </a>
        )}
      </div>

      {error && <div className="app-error-msg">{error}</div>}
      {notice && (
        <div
          role="status"
          style={{
            background: "#dcfce7",
            border: "1px solid #86efac",
            color: "#166534",
            padding: "0.625rem 0.875rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          ✓ {notice}
        </div>
      )}

      {/* ===== ปี + เดือน ===== */}
      <div className="app-card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <button type="button" className="app-btn app-btn-ghost app-btn-sm" onClick={() => setYear((y) => y - 1)} aria-label="ปีก่อน">
            ‹
          </button>
          <strong style={{ minWidth: "4.5rem", textAlign: "center" }}>พ.ศ. {year + 543}</strong>
          <button type="button" className="app-btn app-btn-ghost app-btn-sm" onClick={() => setYear((y) => y + 1)} aria-label="ปีถัดไป">
            ›
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(5.5rem, 1fr))", gap: "0.375rem" }}>
          {MONTHS_TH.map((label, i) => {
            const key = `${year}-${String(i + 1).padStart(2, "0")}`;
            const c = coverage(key);
            const complete = c.total > 0 && c.done === c.total;
            const active = i + 1 === month;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMonth(i + 1)}
                aria-pressed={active}
                style={{
                  padding: "0.5rem 0.25rem",
                  borderRadius: "0.5rem",
                  border: `1px solid ${active ? "#2563eb" : "#e2e8f0"}`,
                  background: active ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                }}
              >
                <div style={{ fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: "0.6875rem", color: complete ? "#16a34a" : c.files > 0 ? "#d97706" : "#94a3b8" }}>
                  {complete ? "✓ ครบ" : c.total > 0 ? `${c.done}/${c.total} บัญชี` : c.files > 0 ? `${c.files} ไฟล์` : "—"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== บัญชีในเดือนที่เลือก ===== */}
      <div className="app-card">
        <div className="app-card-header">
          <div>
            <h2 className="app-card-title">
              {MONTHS_TH_FULL[month - 1]} {year + 543}
            </h2>
            <p className="app-card-subtitle">รองรับ PDF และรูปภาพ · อัปโหลดได้หลายไฟล์ต่อบัญชี</p>
          </div>
          {monthFolderUrl && (
            <a href={monthFolderUrl} target="_blank" rel="noopener noreferrer" className="app-btn app-btn-ghost app-btn-sm">
              📁 โฟลเดอร์เดือนนี้
            </a>
          )}
        </div>

        {q.isLoading && <p style={{ color: "#64748b", fontSize: "0.875rem" }}>กำลังโหลด…</p>}
        {q.error && <div className="app-error-msg">{q.error.message}</div>}

        {q.data && (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {banks.length === 0 && (
              <p style={{ fontSize: "0.875rem", color: "#64748b", margin: 0 }}>
                ยังไม่มีบัญชีธนาคารของบริษัท —{" "}
                <a href="/settings/org" style={{ color: "#2563eb", textDecoration: "underline" }}>
                  เพิ่มที่ ตั้งค่าองค์กร
                </a>{" "}
                หรืออัปโหลดเป็น &ldquo;บัญชีอื่น&rdquo; ด้านล่าง
              </p>
            )}
            {banks.map((b) => {
              const rows = monthRows.filter((r) => r.companyBankId === b.companyBankId);
              return (
                <BankRow
                  key={b.companyBankId}
                  title={b.label}
                  subtitle={b.accountName}
                  done={rows.length > 0}
                  uploading={uploading === b.companyBankId}
                  disabled={!!uploading}
                  onPick={(files) => upload(files, b.companyBankId)}
                >
                  {fileList(rows)}
                </BankRow>
              );
            })}
            <BankRow
              title="บัญชีอื่น"
              subtitle="บัญชีที่ไม่ได้อยู่ในรายชื่อ เช่น บัญชีออมทรัพย์/ต่างประเทศ"
              done={otherRows.length > 0}
              uploading={uploading === OTHER}
              disabled={!!uploading}
              onPick={(files) => upload(files, OTHER)}
              extra={
                <input
                  type="text"
                  value={otherLabel}
                  onChange={(e) => setOtherLabel(e.target.value)}
                  placeholder="ชื่อธนาคาร / เลขบัญชี"
                  className="app-input"
                  maxLength={100}
                  style={{ maxWidth: "16rem" }}
                />
              }
            >
              {fileList(otherRows)}
            </BankRow>
          </div>
        )}

        <p className="app-hint" style={{ marginTop: "1rem" }}>
          💡 ส่งให้สำนักงานบัญชี: เปิด &ldquo;📁 โฟลเดอร์ Reports&rdquo; ใน Google Drive แล้วแชร์ให้อีเมลสำนักงานบัญชีครั้งเดียว —
          ไฟล์ของทุกเดือนต่อจากนี้จะเห็นอัตโนมัติ
        </p>
      </div>
    </div>
  );
}

function BankRow({
  title,
  subtitle,
  done,
  uploading,
  disabled,
  onPick,
  extra,
  children,
}: {
  title: string;
  subtitle?: string;
  done: boolean;
  uploading: boolean;
  disabled: boolean;
  onPick: (files: FileList | null) => void;
  extra?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ border: `1px solid ${done ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: "0.625rem", padding: "0.75rem 0.875rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
            <span style={{ color: done ? "#16a34a" : "#cbd5e1", marginRight: "0.375rem" }}>{done ? "✓" : "○"}</span>
            {title}
          </div>
          {subtitle && <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {extra}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            multiple
            hidden
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={done ? "app-btn app-btn-secondary app-btn-sm" : "app-btn app-btn-primary app-btn-sm"}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "⏳ กำลังอัปโหลด…" : done ? "+ เพิ่มไฟล์" : "⬆️ อัปโหลด statement"}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
