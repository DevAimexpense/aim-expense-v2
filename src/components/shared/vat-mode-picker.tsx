"use client";

// ===========================================
// VatModePicker — เลือกโหมด VAT ของเอกสารรายรับ (ใบเสนอราคา / ใบวางบิล)
//   none      = ไม่มี VAT เลย (ธุรกิจไม่จดทะเบียน VAT) → ไม่มีบรรทัด VAT, ยอดรวม = ยอดก่อน VAT
//   exclusive = ราคายังไม่รวม VAT → บวก 7% ทับ
//   included  = ราคารวม VAT แล้ว → ถอด 7/107 ออกมาแสดง
// ใบกำกับภาษีไม่ใช้ตัวนี้ — ต้องมี VAT เสมอ
// ===========================================

export type VatMode = "none" | "exclusive" | "included";

export function vatModeOf(isVat: boolean, vatIncluded: boolean): VatMode {
  if (!isVat) return "none";
  return vatIncluded ? "included" : "exclusive";
}

export function vatFlagsOf(mode: VatMode): { isVat: boolean; vatIncluded: boolean } {
  return { isVat: mode !== "none", vatIncluded: mode === "included" };
}

const OPTIONS: { value: VatMode; label: string }[] = [
  { value: "none", label: "ไม่มี VAT" },
  { value: "exclusive", label: "ราคายังไม่รวม VAT (บวก 7%)" },
  { value: "included", label: "ราคารวม VAT แล้ว" },
];

interface Props {
  value: VatMode;
  onChange: (mode: VatMode) => void;
  disabled?: boolean;
}

export function VatModePicker({ value, onChange, disabled }: Props) {
  return (
    <div className="app-form-group">
      <label className="app-label">โหมด VAT</label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <label
              key={opt.value}
              style={{
                flex: "1 1 auto",
                padding: "0.5rem 0.75rem",
                border: `2px solid ${active ? "#2563eb" : "#e2e8f0"}`,
                background: active ? "#eff6ff" : "white",
                borderRadius: "0.5rem",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
                fontSize: "0.8125rem",
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="radio"
                name="vatMode"
                checked={active}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
                style={{ marginRight: "0.5rem" }}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
      {value === "none" && (
        <p className="app-hint">
          ไม่มีบรรทัด VAT ในเอกสาร — สำหรับธุรกิจที่ไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม
          (ออกใบกำกับภาษีจากเอกสารนี้ไม่ได้)
        </p>
      )}
    </div>
  );
}
