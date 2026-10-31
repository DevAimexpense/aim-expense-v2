// ===========================================
// ปุ่มของเว็บสาธารณะ — ชุดเดียวกับ aim-hr (src/components/ui/button.tsx): ทรง rounded-xl
// ไม่มี hook จึงใช้ใน server component ได้ · render เป็น <Link> เมื่อมี href, <a> เมื่อ external
// variant "line" = ปุ่มเพิ่มเพื่อน LINE (เขียวมาตรฐานของ LINE — ใช้เฉพาะปุ่มนี้)
// ===========================================
import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "inverse" | "outline" | "ghost" | "outline-inverse" | "line";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const VARIANT: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
  inverse: "bg-white text-brand-700 shadow-sm hover:bg-brand-50",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  "outline-inverse": "border border-white/30 text-white hover:border-white/60 hover:bg-white/10",
  line: "bg-[#06C755] text-white shadow-sm hover:opacity-90",
};
const SIZE: Record<Size, string> = {
  sm: "rounded-lg px-3 py-1.5 text-sm",
  md: "rounded-xl px-4 py-2.5 text-sm",
  lg: "rounded-xl px-6 py-3 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return [BASE, VARIANT[variant], SIZE[size], extra].filter(Boolean).join(" ");
}

export function Button({
  href,
  external,
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  href?: string;
  external?: boolean;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  const cls = buttonClass(variant, size, className);
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
