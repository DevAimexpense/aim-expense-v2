"use client";

// ===========================================
// ชื่อผู้ขาย — ช่องพิมพ์ที่ค้นหาจากผู้รับเงิน (Payees) ที่มีอยู่ได้
//   - พิมพ์ชื่อหรือเลขผู้เสียภาษี → แสดงรายการที่ตรง → เลือกแล้วเติมชื่อ/เลขภาษี/ที่อยู่ให้
//   - ไม่มีในระบบ → แถว "+ เพิ่ม 'ชื่อ' เป็นผู้ขายใหม่" (ผู้เรียกสร้าง payee ตอนบันทึกเหมือนเดิม)
//   - ยังพิมพ์ชื่ออิสระได้เหมือนช่องเดิม (ไม่บังคับให้เลือกจากรายการ)
// หน้าตา/การกดคีย์บอร์ดเหมือน SearchableSelect
// ===========================================

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface VendorOption {
  payeeId: string;
  payeeName: string;
  taxId?: string;
  address?: string;
  isVAT?: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export function VendorCombobox({
  value,
  onChange,
  payees,
  selectedPayeeId,
  onSelectPayee,
  onCreateNew,
  placeholder = "พิมพ์ชื่อหรือเลขผู้เสียภาษีเพื่อค้นหา",
  className = "app-input",
}: {
  /** ชื่อผู้ขายปัจจุบัน */
  value: string;
  /** พิมพ์ชื่ออิสระ */
  onChange: (name: string) => void;
  payees: VendorOption[];
  /** payee ที่ผูกกับชื่อนี้อยู่ (แสดงป้าย "จากรายการ") */
  selectedPayeeId?: string;
  onSelectPayee: (p: VendorOption) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const query = value.trim();
  const matches = useMemo(() => {
    if (!query) return payees.slice(0, 50);
    const q = norm(query);
    const digits = query.replace(/\D/g, "");
    return payees
      .filter(
        (p) =>
          norm(p.payeeName).includes(q) || (digits.length >= 3 && (p.taxId || "").includes(digits)),
      )
      .slice(0, 50);
  }, [payees, query]);
  const exact = payees.some((p) => norm(p.payeeName) === norm(query));
  const showCreate = !!query && !exact;
  const rowCount = matches.length + (showCreate ? 1 : 0);
  const linked = selectedPayeeId ? payees.find((p) => p.payeeId === selectedPayeeId) : undefined;
  const isLinked = !!linked && norm(linked.payeeName) === norm(value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (highlight >= 0) (listRef.current?.children[highlight] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const pick = (idx: number) => {
    if (idx < matches.length) onSelectPayee(matches[idx]);
    else if (showCreate) onCreateNew(query);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, rowCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (highlight >= 0 && highlight < rowCount) {
        e.preventDefault();
        pick(highlight);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const rowStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    background: active ? "#e0f2fe" : undefined,
  });

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        style={isLinked ? { paddingRight: "6.5rem" } : undefined}
      />
      {isLinked && (
        <span
          style={{
            position: "absolute",
            right: "0.5rem",
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "0.6875rem",
            padding: "0.125rem 0.5rem",
            borderRadius: "999px",
            background: "#dcfce7",
            color: "#166534",
            pointerEvents: "none",
          }}
        >
          ✓ จากรายการ
        </span>
      )}

      {open && rowCount > 0 && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
            marginTop: "0.25rem",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            maxHeight: "16rem",
            overflowY: "auto",
          }}
        >
          {matches.map((p, idx) => (
            <div
              key={p.payeeId}
              role="option"
              aria-selected={highlight === idx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(idx)}
              onMouseEnter={() => setHighlight(idx)}
              style={rowStyle(highlight === idx)}
            >
              <div style={{ fontWeight: p.payeeId === selectedPayeeId ? 600 : 500 }}>
                {p.payeeName}
                {p.isVAT && <span style={{ color: "#64748b", fontWeight: 400 }}> (VAT)</span>}
              </div>
              {p.taxId && <div style={{ fontSize: "0.75rem", color: "#64748b" }} className="mono">{p.taxId}</div>}
            </div>
          ))}
          {showCreate && (
            <div
              role="option"
              aria-selected={highlight === matches.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(matches.length)}
              onMouseEnter={() => setHighlight(matches.length)}
              style={{
                ...rowStyle(highlight === matches.length),
                borderTop: matches.length ? "1px solid #f1f5f9" : undefined,
                color: "#9a3412",
                fontWeight: 600,
              }}
            >
              + เพิ่ม “{query}” เป็นผู้ขายใหม่
            </div>
          )}
        </div>
      )}
    </div>
  );
}
