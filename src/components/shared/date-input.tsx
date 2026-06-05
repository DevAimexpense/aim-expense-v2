"use client";

import { useEffect, useRef, useState } from "react";

// แปลง ISO (yyyy-mm-dd) → แสดงผล (dd/mm/yyyy)
function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// แปลง dd/mm/yyyy → ISO (yyyy-mm-dd) ถ้าถูกต้อง, ไม่งั้น null
function displayToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  const y = m[3];
  const dt = new Date(`${y}-${mo}-${d}T00:00:00`);
  if (
    isNaN(dt.getTime()) ||
    dt.getUTCMonth() + 1 !== Number(mo) ||
    dt.getUTCDate() !== Number(d)
  ) {
    return null; // เช่น 31/02/2026
  }
  return `${y}-${mo}-${d}`;
}

/**
 * Date input ที่แสดง/รับค่าเป็น วว/ดด/ปปปป (DD/MM/YYYY) เสมอ ไม่ขึ้นกับ locale ของ browser
 * (native <input type="date"> แสดง format ตาม locale บังคับไม่ได้)
 * - เก็บค่าเป็น ISO (yyyy-mm-dd) เหมือน type=date เดิม → API/logic ไม่ต้องแก้
 * - มีปุ่ม 📅 เปิดปฏิทิน native ไว้เลือกสะดวก
 */
export default function DateInput({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string; // ISO yyyy-mm-dd
  onChange: (iso: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [textValue, setTextValue] = useState(isoToDisplay(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  // sync เมื่อ value ภายนอกเปลี่ยน (เช่น เปิดฟอร์มแก้ไข)
  useEffect(() => {
    setTextValue(isoToDisplay(value));
  }, [value]);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="วว/ดด/ปปปป"
        value={textValue}
        disabled={disabled}
        onChange={(e) => {
          setTextValue(e.target.value);
          const iso = displayToIso(e.target.value);
          if (iso) onChange(iso);
        }}
        onBlur={() => setTextValue(isoToDisplay(value))}
        className={className}
        style={{ flex: 1, paddingRight: "2rem" }}
      />
      {/* native picker ซ่อนไว้ ใช้ปุ่มปฏิทินเรียก */}
      <input
        ref={pickerRef}
        type="date"
        value={value}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          right: "2rem",
          pointerEvents: "none",
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const el = pickerRef.current;
          if (el?.showPicker) el.showPicker();
          else el?.focus();
        }}
        title="เลือกจากปฏิทิน"
        style={{
          position: "absolute",
          right: "0.5rem",
          background: "none",
          border: "none",
          cursor: disabled ? "default" : "pointer",
          fontSize: "1rem",
          lineHeight: 1,
          padding: 0,
        }}
      >
        📅
      </button>
    </div>
  );
}
