"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";

interface Props {
  isAdmin: boolean;
}

const PREFIX_REGEX = /^[A-Z0-9/-]+$/;

function validatePrefix(value: string): string | null {
  if (!value) return "ห้ามเว้นว่าง";
  if (value.length > 8) return "max 8 ตัวอักษร";
  if (/\s/.test(value)) return "ห้ามมี space";
  if (!PREFIX_REGEX.test(value)) return "อนุญาตเฉพาะ A-Z 0-9 / -";
  return null;
}

export function DocPrefixSection({ isAdmin }: Props) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.org.getDocPrefixes.useQuery();
  const updateMut = trpc.org.updateDocPrefixes.useMutation();

  const [form, setForm] = useState({ QT: "QT", BIL: "BIL", TI: "TI" });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm({ QT: data.QT, BIL: data.BIL, TI: data.TI });
  }, [data]);

  const errQT = validatePrefix(form.QT);
  const errBIL = validatePrefix(form.BIL);
  const errTI = validatePrefix(form.TI);
  const hasErr = !!(errQT || errBIL || errTI);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (hasErr) {
      setError("กรุณาแก้ไข prefix ที่ไม่ถูกต้องก่อน");
      return;
    }
    try {
      await updateMut.mutateAsync({
        QT: form.QT.trim(),
        BIL: form.BIL.trim(),
        TI: form.TI.trim(),
      });
      setSuccess(true);
      utils.org.getDocPrefixes.invalidate();
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  return (
    <div className="app-card">
      <div className="app-card-header">
        <div>
          <h2 className="app-card-title">🔢 เลขที่เอกสาร</h2>
          <p className="app-card-subtitle">
            กำหนด prefix สำหรับเลขเอกสาร — รูปแบบ {`{PREFIX}-{YEAR}-{0001}`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: "1rem 0", color: "#64748b" }}>
          กำลังโหลด...
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <div className="app-error-msg">{error}</div>}
          {success && (
            <div
              style={{
                background: "#dcfce7",
                border: "1px solid #86efac",
                color: "#166534",
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                marginBottom: "1rem",
              }}
            >
              ✓ บันทึก prefix สำเร็จ
            </div>
          )}

          <PrefixField
            label="ใบเสนอราคา (Quotation)"
            preview={`${form.QT}-${new Date().getFullYear()}-0001`}
            value={form.QT}
            onChange={(v) => setForm({ ...form, QT: v.toUpperCase() })}
            error={errQT}
            disabled={!isAdmin}
          />
          <PrefixField
            label="ใบวางบิล (Billing)"
            preview={`${form.BIL}-${new Date().getFullYear()}-0001`}
            value={form.BIL}
            onChange={(v) => setForm({ ...form, BIL: v.toUpperCase() })}
            error={errBIL}
            disabled={!isAdmin}
          />
          <PrefixField
            label="ใบกำกับภาษี (Tax Invoice)"
            preview={`${form.TI}-${new Date().getFullYear()}-0001`}
            value={form.TI}
            onChange={(v) => setForm({ ...form, TI: v.toUpperCase() })}
            error={errTI}
            disabled={!isAdmin}
          />

          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem 0.875rem",
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
              color: "#78350f",
            }}
          >
            ⚠️ การเปลี่ยน prefix ไม่กระทบเอกสารเก่า แต่อาจทำให้ลำดับเลขใหม่ไม่ต่อเนื่องกับเดิม
          </div>

          {isAdmin && (
            <button
              type="submit"
              disabled={updateMut.isPending || hasErr}
              className="app-btn app-btn-primary"
              style={{ marginTop: "1rem" }}
            >
              {updateMut.isPending ? (
                <>
                  <span className="app-spinner" />
                  กำลังบันทึก...
                </>
              ) : (
                "💾 บันทึก prefix"
              )}
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function PrefixField({
  label,
  preview,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string;
  preview: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  disabled: boolean;
}) {
  return (
    <div className="app-form-group">
      <label className="app-label">{label}</label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="app-input mono"
          maxLength={8}
          style={{ maxWidth: "10rem" }}
          aria-invalid={!!error}
        />
        <div
          style={{
            padding: "0.625rem 0.75rem",
            background: "#f1f5f9",
            borderRadius: "0.5rem",
            fontSize: "0.8125rem",
            color: "#475569",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
          }}
        >
          ตัวอย่าง: <strong>{preview}</strong>
        </div>
      </div>
      {error && (
        <div
          style={{
            color: "#b91c1c",
            fontSize: "0.75rem",
            marginTop: "0.25rem",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
