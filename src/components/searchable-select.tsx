"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Show this text for the empty/default option. If set, a "clear" option is shown at top. */
  emptyLabel?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "เลือก...",
  disabled = false,
  className = "app-select",
  style,
  emptyLabel,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Current display label
  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption?.label || emptyLabel || placeholder;

  // Filtered options
  const normalizeSearch = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const filtered = search
    ? options.filter((o) => normalizeSearch(o.label).includes(normalizeSearch(search)))
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const items = listRef.current.children;
      const offset = emptyLabel ? 1 : 0;
      const el = items[highlightIdx + offset] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx, emptyLabel]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearch("");
    setHighlightIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled]);

  const selectValue = useCallback(
    (val: string) => {
      onChange(val);
      setIsOpen(false);
      setSearch("");
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((prev) => Math.min(prev + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < filtered.length) {
          selectValue(filtered[highlightIdx].value);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSearch("");
        break;
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }} onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        className={className}
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
        disabled={disabled}
        style={{
          width: "100%",
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: "2.375rem",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            color: !selectedOption && !value ? "#94a3b8" : undefined,
          }}
        >
          {displayLabel}
        </span>
        <span style={{ marginLeft: "0.5rem", fontSize: "0.65rem", color: "#94a3b8", flexShrink: 0 }}>
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
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
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Search input */}
          <div style={{ padding: "0.5rem", borderBottom: "1px solid #f1f5f9" }}>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightIdx(0);
              }}
              placeholder="🔍 พิมพ์เพื่อค้นหา..."
              style={{
                width: "100%",
                padding: "0.375rem 0.5rem",
                border: "1px solid #e2e8f0",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
          </div>

          {/* Options list */}
          <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
            {emptyLabel && (
              <div
                onClick={() => selectValue("")}
                style={{
                  padding: "0.5rem 0.75rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  color: "#94a3b8",
                  fontStyle: "italic",
                  background: !value ? "#f1f5f9" : undefined,
                }}
                onMouseEnter={() => setHighlightIdx(-1)}
              >
                {emptyLabel}
              </div>
            )}
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "0.75rem",
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: "0.875rem",
                }}
              >
                ไม่พบรายการที่ค้นหา
              </div>
            ) : (
              filtered.map((opt, idx) => (
                <div
                  key={opt.value}
                  onClick={() => selectValue(opt.value)}
                  style={{
                    padding: "0.5rem 0.75rem",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    background:
                      highlightIdx === idx
                        ? "#e0f2fe"
                        : opt.value === value
                          ? "#f1f5f9"
                          : undefined,
                    fontWeight: opt.value === value ? 600 : undefined,
                  }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
