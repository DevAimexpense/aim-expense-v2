/**
 * DateRangePicker — pick a start/end date range with Thai presets.
 * Built on react-day-picker v9 + date-fns + Thai locale (Buddhist Era display).
 *
 * @example
 *   const [range, setRange] = useState<DateRange>(getDefaultRange());
 *   <DateRangePicker value={range} onChange={setRange} />
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange as RDPDateRange } from "react-day-picker";
import { th } from "date-fns/locale";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
  isValid,
  isSameDay,
} from "date-fns";

export interface DateRange {
  from: Date;
  to: Date;
}

export type DateRangePreset = "this-month" | "last-month";

export interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange) => void;
  /** Which preset buttons to show. Default: ["this-month", "last-month"] */
  presets?: DateRangePreset[];
  /** Disable dates before this */
  minDate?: Date;
  /** Disable dates after this */
  maxDate?: Date;
  /** Popover alignment relative to trigger (default left) */
  align?: "left" | "right";
  /** Disable interaction */
  disabled?: boolean;
  /** className hook */
  className?: string;
}

const DEFAULT_PRESETS: DateRangePreset[] = ["this-month", "last-month"];

export function getPresetRange(preset: DateRangePreset, today = new Date()): DateRange {
  switch (preset) {
    case "this-month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last-month": {
      const prev = subMonths(today, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
  }
}

function presetLabel(p: DateRangePreset): string {
  return p === "this-month" ? "เดือนนี้" : "เดือนก่อน";
}

/** Format a Date to Thai short form with Buddhist year, e.g. "1 เม.ย. 2569" */
function formatThai(d: Date): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatRange(r: DateRange): string {
  if (isSameDay(r.from, r.to)) return formatThai(r.from);
  return `${formatThai(r.from)} – ${formatThai(r.to)}`;
}

export function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  minDate,
  maxDate,
  align = "left",
  disabled = false,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RDPDateRange | undefined>(
    value ? { from: value.from, to: value.to } : undefined
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep draft in sync if external value changes
  useEffect(() => {
    if (value) setDraft({ from: value.from, to: value.to });
  }, [value]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const applyPreset = (p: DateRangePreset) => {
    const r = getPresetRange(p);
    setDraft({ from: r.from, to: r.to });
    onChange(r);
    setOpen(false);
  };

  const applyCustom = () => {
    if (draft?.from && draft?.to && isValid(draft.from) && isValid(draft.to)) {
      onChange({ from: draft.from, to: draft.to });
      setOpen(false);
    }
  };

  const cancel = () => {
    setDraft(value ? { from: value.from, to: value.to } : undefined);
    setOpen(false);
  };

  const triggerLabel = value ? formatRange(value) : "เลือกช่วงวันที่";

  return (
    <div
      ref={containerRef}
      className={["app-daterange", className].filter(Boolean).join(" ")}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        type="button"
        className="app-btn app-btn-secondary app-daterange-trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden="true">📅</span>
        <span>{triggerLabel}</span>
      </button>

      {open && (
        <div
          className="app-daterange-popover"
          role="dialog"
          aria-label="เลือกช่วงวันที่"
          style={align === "right" ? { right: 0 } : { left: 0 }}
        >
          <div className="app-daterange-presets">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className="app-btn app-btn-ghost app-btn-sm app-daterange-preset"
                onClick={() => applyPreset(p)}
              >
                {presetLabel(p)}
              </button>
            ))}
          </div>

          <div className="app-daterange-calendar">
            <DayPicker
              mode="range"
              selected={draft}
              onSelect={setDraft}
              numberOfMonths={1}
              defaultMonth={draft?.from ?? new Date()}
              locale={th}
              disabled={
                minDate || maxDate
                  ? { before: minDate, after: maxDate } as any
                  : undefined
              }
              formatters={{
                formatCaption: (date) =>
                  format(date, "LLLL", { locale: th }) +
                  " " +
                  (date.getFullYear() + 543),
              }}
            />
          </div>

          <div className="app-daterange-actions">
            <button
              type="button"
              className="app-btn app-btn-ghost app-btn-sm"
              onClick={cancel}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="app-btn app-btn-primary app-btn-sm"
              onClick={applyCustom}
              disabled={!draft?.from || !draft?.to}
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
