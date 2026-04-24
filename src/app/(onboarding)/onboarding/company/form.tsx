"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompanyForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    taxId: "",
    branchType: "HQ" as "HQ" | "Branch",
    branchNumber: "00000",
    address: "",
    phone: "",
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    if (!form.name.trim()) return "โปรดกรอกชื่อบริษัท";
    if (!form.taxId.trim()) return "โปรดกรอกเลขประจำตัวผู้เสียภาษี";
    if (!/^\d{13}$/.test(form.taxId.trim()))
      return "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก";
    if (form.branchType === "Branch" && !/^\d{5}$/.test(form.branchNumber))
      return "เลขสาขาต้องเป็นตัวเลข 5 หลัก";
    if (!form.address.trim()) return "โปรดกรอกที่อยู่บริษัท";
    if (!acceptedTerms)
      return "โปรดยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งาน";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/create-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          taxId: form.taxId.trim(),
          branchType: form.branchType,
          branchNumber:
            form.branchType === "HQ" ? "00000" : form.branchNumber,
          address: form.address.trim(),
          phone: form.phone.trim() || null,
          acceptedTerms: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "ไม่สามารถสร้างบริษัทได้");
      }

      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setIsLoading(false);
    }
  };

  return (
    <div className="onb-step-wrap">
      <form onSubmit={handleSubmit} className="onb-card">
        <div style={{ marginBottom: "1.5rem" }}>
          <div className="onb-step-pill yellow">
            <span className="dot" />
            ขั้นตอนที่ 4 จาก 4
          </div>
          <h1 className="onb-title">ตั้งค่าบริษัทของคุณ</h1>
          <p className="onb-subtitle">
            ข้อมูลนี้จะใช้ในเอกสาร ใบกำกับภาษี และรายงานของบริษัท
          </p>
        </div>

        {error && <div className="onb-error">{error}</div>}

        <div className="onb-field">
          <label htmlFor="company-name" className="onb-label">
            ชื่อบริษัท<span className="onb-label-required">*</span>
          </label>
          <p className="onb-hint">ชื่อที่จะแสดงในเอกสารและระบบ</p>
          <input
            id="company-name"
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="บริษัท ของคุณ จำกัด"
            className="onb-input"
            required
            maxLength={200}
          />
        </div>

        <div className="onb-field">
          <label htmlFor="tax-id" className="onb-label">
            เลขประจำตัวผู้เสียภาษี<span className="onb-label-required">*</span>
          </label>
          <p className="onb-hint">ตัวเลข 13 หลักจากกรมสรรพากร</p>
          <input
            id="tax-id"
            type="text"
            inputMode="numeric"
            value={form.taxId}
            onChange={(e) =>
              update("taxId", e.target.value.replace(/\D/g, "").slice(0, 13))
            }
            placeholder="0123456789012"
            className="onb-input mono"
            required
            maxLength={13}
          />
        </div>

        <div className="onb-field">
          <label className="onb-label">
            ประเภทสำนักงาน<span className="onb-label-required">*</span>
          </label>
          <p className="onb-hint">
            ใช้ในเอกสารทางภาษี (ใบกำกับภาษี, ภพ.30)
          </p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <label
              style={{
                flex: 1,
                padding: "0.75rem 1rem",
                border: `2px solid ${form.branchType === "HQ" ? "#2563eb" : "#e2e8f0"}`,
                borderRadius: "0.5rem",
                background: form.branchType === "HQ" ? "#eff6ff" : "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.875rem",
              }}
            >
              <input
                type="radio"
                name="branchType"
                value="HQ"
                checked={form.branchType === "HQ"}
                onChange={(e) => update("branchType", e.target.value)}
              />
              สำนักงานใหญ่
            </label>
            <label
              style={{
                flex: 1,
                padding: "0.75rem 1rem",
                border: `2px solid ${form.branchType === "Branch" ? "#2563eb" : "#e2e8f0"}`,
                borderRadius: "0.5rem",
                background: form.branchType === "Branch" ? "#eff6ff" : "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.875rem",
              }}
            >
              <input
                type="radio"
                name="branchType"
                value="Branch"
                checked={form.branchType === "Branch"}
                onChange={(e) => update("branchType", e.target.value)}
              />
              สาขา
            </label>
          </div>
        </div>

        {form.branchType === "Branch" && (
          <div className="onb-field">
            <label htmlFor="branch-number" className="onb-label">
              เลขสาขา<span className="onb-label-required">*</span>
            </label>
            <p className="onb-hint">5 หลัก เช่น 00001 (ตามที่กรมสรรพากรออกให้)</p>
            <input
              id="branch-number"
              type="text"
              inputMode="numeric"
              value={form.branchNumber}
              onChange={(e) =>
                update("branchNumber", e.target.value.replace(/\D/g, "").slice(0, 5))
              }
              placeholder="00001"
              className="onb-input mono"
              maxLength={5}
              required
            />
          </div>
        )}

        <div className="onb-field">
          <label htmlFor="address" className="onb-label">
            ที่อยู่บริษัท<span className="onb-label-required">*</span>
          </label>
          <textarea
            id="address"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="เลขที่ หมู่ ซอย ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
            rows={3}
            className="onb-input onb-textarea"
            required
            maxLength={500}
          />
        </div>

        <div className="onb-field">
          <label htmlFor="phone" className="onb-label">
            เบอร์โทรบริษัท
          </label>
          <p className="onb-hint">ไม่บังคับ</p>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="02-xxx-xxxx"
            className="onb-input"
            maxLength={20}
          />
        </div>

        <div className="onb-auto-list">
          <p className="onb-auto-title">ระบบจะดำเนินการอัตโนมัติ</p>
          <ul>
            <li>• สร้าง Master Sheet ใน Google Drive ของคุณ</li>
            <li>• สร้างโฟลเดอร์สำหรับใบเสร็จ/เอกสาร/รายงาน</li>
            <li>• เพิ่มข้อมูลธนาคารไทย 8 แห่งเริ่มต้น</li>
            <li>• ตั้งค่าสิทธิ์ให้คุณเป็น Admin</li>
          </ul>
        </div>

        <label
          style={{
            display: "flex",
            gap: "0.625rem",
            alignItems: "flex-start",
            marginTop: "1.25rem",
            padding: "0.875rem 1rem",
            border: "1px solid #e2e8f0",
            borderRadius: "0.75rem",
            background: "#f8fafc",
            cursor: "pointer",
            fontSize: "0.875rem",
            lineHeight: 1.5,
            color: "#475569",
          }}
        >
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            style={{ marginTop: "0.2rem", flexShrink: 0 }}
          />
          <span>
            ฉันยอมรับ{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>
              นโยบายความเป็นส่วนตัว
            </a>{" "}
            และ{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>
              ข้อกำหนดการใช้งาน
            </a>{" "}
            ของ Aim Expense
          </span>
        </label>

        <button type="submit" disabled={isLoading || !acceptedTerms} className="onb-btn-primary" style={{ marginTop: "1rem" }}>
          {isLoading ? (
            <>
              <div
                style={{
                  height: "1.25rem",
                  width: "1.25rem",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "white",
                  borderRadius: "50%",
                  animation: "spin 0.6s linear infinite",
                }}
              />
              <span>กำลังสร้างบริษัท...</span>
            </>
          ) : (
            <>
              <span>สร้างบริษัท และเริ่มใช้งาน</span>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </>
          )}
        </button>
      </form>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
