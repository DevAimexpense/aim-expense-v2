"use client";

// ===========================================
// Shared selector: บุคคลธรรมดา (personal) vs นิติบุคคล (company)
// Used by onboarding + /businesses/new creation forms.
// ===========================================

type EntityType = "company" | "personal";

const OPTIONS: { value: EntityType; icon: string; title: string; desc: string }[] = [
  {
    value: "personal",
    icon: "👤",
    title: "บุคคลธรรมดา",
    desc: "ฟรีแลนซ์ / ส่วนตัว (ไม่จด VAT)",
  },
  {
    value: "company",
    icon: "🏢",
    title: "นิติบุคคล",
    desc: "บริษัท / ห้างหุ้นส่วน (จด VAT)",
  },
];

export function EntityTypePicker({
  value,
  onChange,
}: {
  value: EntityType;
  onChange: (v: EntityType) => void;
}) {
  return (
    <div className="onb-field">
      <label className="onb-label">
        ประเภทผู้ใช้งาน<span className="onb-label-required">*</span>
      </label>
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                flex: 1,
                padding: "0.875rem 1rem",
                border: `2px solid ${active ? "#2563eb" : "#e2e8f0"}`,
                borderRadius: "0.5rem",
                background: active ? "#eff6ff" : "white",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#0f172a" }}>
                {opt.icon} {opt.title}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{opt.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
