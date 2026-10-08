"use client";

// ===========================================
// FitLine — ข้อความบรรทัดเดียว ย่อขนาดตัวอักษรอัตโนมัติให้พอดีความกว้างที่มี
// ใช้กับที่อยู่ในหัวจดหมายของเอกสาร (ไม่ให้รหัสไปรษณีย์ตกไปอีกบรรทัด)
// วัดจริงใน DOM แล้วลด font-size ทีละขั้นจนไม่ล้น (ต่ำสุด minScale ของขนาดเดิม)
// วัดซ้ำเมื่อ resize และก่อนพิมพ์ (หน้ากระดาษแคบกว่าจอ)
// ===========================================

import { useLayoutEffect, useRef } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
  /** สัดส่วนต่ำสุดของขนาดตัวอักษรเดิม (0.7 = ย่อได้ถึง 70%) */
  minScale?: number;
}

export function FitLine({ children, className, minScale = 0.7 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      el.style.fontSize = ""; // เริ่มจากขนาดตาม CSS ทุกครั้ง
      const base = parseFloat(getComputedStyle(el).fontSize) || 13;
      let scale = 1;
      // ลดทีละ 2.5% จนพอดี หรือถึงขั้นต่ำ
      while (el.scrollWidth > el.clientWidth + 0.5 && scale > minScale) {
        scale -= 0.025;
        el.style.fontSize = `${(base * scale).toFixed(2)}px`;
      }
    };

    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    window.addEventListener("beforeprint", fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener("beforeprint", fit);
    };
  }, [children, minScale]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ whiteSpace: "nowrap", overflow: "hidden", minWidth: 0 }}
    >
      {children}
    </div>
  );
}
