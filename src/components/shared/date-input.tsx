"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

// ===========================================
// DateInput — ช่องกรอกวันที่ที่แสดง/รับค่าเป็น วว/ดด/ปปปป (พ.ศ.) เสมอ
//
// native <input type="date"> แสดงตาม locale ของ browser (เครื่องภาษาอังกฤษ = เดือน/วัน/ปี)
// บังคับไม่ได้ → ใช้ช่องข้อความของเราเอง + ปุ่ม 📅 เปิดปฏิทิน native ซ่อนไว้
// - ค่าที่ส่งออก/รับเข้าเป็น ISO (yyyy-mm-dd, ค.ศ.) เหมือน type=date เดิม → API/logic ไม่ต้องแก้
// - แสดงปี พ.ศ. ให้ตรงกับทุกหน้าในระบบ (formatDate) · พิมพ์ปี ค.ศ. ก็รับได้ (ปี < 2400 = ค.ศ.)
// ===========================================

const BE_OFFSET = 543;

// ISO (yyyy-mm-dd) → แสดงผล dd/mm/yyyy (พ.ศ.)
function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${Number(m[1]) + BE_OFFSET}`;
}

// dd/mm/yyyy (พ.ศ. หรือ ค.ศ.) → ISO ถ้าถูกต้อง, ไม่งั้น null
function displayToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  let y = Number(m[3]);
  if (y >= 2400) y -= BE_OFFSET; // พ.ศ. → ค.ศ.
  const dt = new Date(`${y}-${mo}-${d}T00:00:00`);
  if (
    isNaN(dt.getTime()) ||
    dt.getMonth() + 1 !== Number(mo) ||
    dt.getDate() !== Number(d)
  ) {
    return null; // เช่น 31/02/2569
  }
  return `${y}-${mo}-${d}`;
}

interface Props {
  value: string; // ISO yyyy-mm-dd
  onChange: (iso: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  /** ISO — ใช้กับปฏิทิน native */
  min?: string;
  max?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  /** style ของกล่องทั้งชุด (เช่น maxWidth) */
  style?: CSSProperties;
}

export default function DateInput({
  value,
  onChange,
  className,
  disabled,
  required,
  min,
  max,
  placeholder,
  id,
  name,
  style,
}: Props) {
  const [textValue, setTextValue] = useState(isoToDisplay(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  // sync เมื่อ value ภายนอกเปลี่ยน (เช่น เปิดฟอร์มแก้ไข / ปุ่มล้างตัวกรอง)
  useEffect(() => {
    setTextValue(isoToDisplay(value));
  }, [value]);

  return (
    <div
      style={{ position: "relative", display: "flex", alignItems: "center", ...style }}
    >
      <input
        type="text"
        inputMode="numeric"
        placeholder={placeholder || "วว/ดด/ปปปป"}
        value={textValue}
        disabled={disabled}
        required={required}
        id={id}
        name={name}
        onChange={(e) => {
          const raw = e.target.value;
          setTextValue(raw);
          if (raw.trim() === "") {
            onChange(""); // ล้างค่า (เช่น ตัวกรอง ตั้งแต่/ถึง)
            return;
          }
          const iso = displayToIso(raw);
          if (iso) onChange(iso);
        }}
        onBlur={() => setTextValue(isoToDisplay(value))}
        className={className}
        style={{ flex: 1, width: "100%", paddingRight: "2rem" }}
      />
      {/* native picker ซ่อนไว้ ใช้ปุ่มปฏิทินเรียก */}
      <input
        ref={pickerRef}
        type="date"
        value={value}
        min={min}
        max={max}
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
