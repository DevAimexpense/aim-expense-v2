"use client";

// ===========================================
// <Reveal> — scroll reveal ตัวเดียวของเว็บสาธารณะ
// - เริ่มต้น "มองเห็น" เสมอ: CSS ซ่อนเฉพาะเมื่อ <html> มี class js-reveal (ใส่โดย <RevealScript> ก่อน paint)
//   → ปิด JS / บอท AI / LINE OA reviewer เห็นเนื้อหาครบ
// - IntersectionObserver เติม is-visible ครั้งเดียวแล้ว unobserve · ไม่มี state, ไม่ re-render
// ===========================================
import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";

export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** วินาที — stagger รายการในกลุ่มเดียวกัน */
  delay?: number;
  as?: "div" | "section" | "article" | "li" | "figure";
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const style = { "--delay": `${delay}s` } as CSSProperties;
  const props = { ref, className: `reveal ${className}`, style, children };
  switch (Tag) {
    case "section": return <section {...(props as React.HTMLAttributes<HTMLElement> & { ref: typeof ref })} />;
    case "article": return <article {...(props as React.HTMLAttributes<HTMLElement> & { ref: typeof ref })} />;
    case "li": return <li {...(props as React.LiHTMLAttributes<HTMLLIElement> & { ref: React.RefObject<HTMLLIElement> })} />;
    case "figure": return <figure {...(props as React.HTMLAttributes<HTMLElement> & { ref: typeof ref })} />;
    default: return <div {...(props as React.HTMLAttributes<HTMLDivElement> & { ref: React.RefObject<HTMLDivElement> })} />;
  }
}

/** ใส่ไว้บนสุดของหน้า (ใน SiteHeader) — เติม js-reveal ก่อน paint แรก ไม่มี flash */
export function RevealScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          "if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('js-reveal')",
      }}
    />
  );
}
