// ===========================================
// /reports — Combined reports page (Client)
//
// Layout
// ------
//   header   — title + sub
//   filters  — DateRangePicker + Project/Status/Type SearchableSelects
//              (filters are SHARED across tabs; tabs read same state)
//   tabs     — ภาพรวม | แยกโปรเจกต์ | แยกผู้รับเงิน
//   content  — current tab's content
//
// Defaults (per spec)
// -------------------
//   - Date range = this month
//   - Project    = all
//   - Status     = all (excluding rejected)
//   - Type       = all
//
// URL persistence
// ---------------
//   tab is sync'd with ?tab=overview|by-project|by-vendor for shareable links.
// ===========================================

"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import SearchableSelect from "@/components/searchable-select";
import {
  DateRangePicker,
  getPresetRange,
  type DateRange,
} from "@/components/shared";
import { formatThaiDate, type PaymentStatus, type ExpenseType } from "./_components";
import { OverviewTab } from "./_overview-tab";
import { ByProjectTab } from "./_by-project-tab";
import { ByVendorTab } from "./_by-vendor-tab";

type TabKey = "overview" | "by-project" | "by-vendor";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "overview", label: "ภาพรวม", icon: "📊" },
  { key: "by-project", label: "แยกโปรเจกต์", icon: "📁" },
  { key: "by-vendor", label: "แยกผู้รับเงิน", icon: "🤝" },
];

export function ReportsClient({ orgName }: { orgName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ----- Tab state (sync to URL) -----
  const tabFromUrl = searchParams.get("tab") as TabKey | null;
  const initialTab: TabKey =
    tabFromUrl && TABS.some((t) => t.key === tabFromUrl)
      ? tabFromUrl
      : "overview";
  const [tab, setTab] = useState<TabKey>(initialTab);

  function handleTabChange(next: TabKey) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  }

  // ----- Shared filters -----
  // Default: this month, all projects, all statuses, all types
  const [range, setRange] = useState<DateRange>(getPresetRange("this-month"));
  const [eventId, setEventId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // ----- Lookups -----
  const eventsQuery = trpc.event.list.useQuery();
  const events = eventsQuery.data || [];

  const fromIso = range.from.toISOString().slice(0, 10);
  const toIso = range.to.toISOString().slice(0, 10);

  const eventIdParam = eventId === "all" ? undefined : eventId;
  const statusParam =
    statusFilter === "all" ? undefined : (statusFilter as PaymentStatus);
  const typeParam =
    typeFilter === "all" ? undefined : (typeFilter as ExpenseType);

  // Disable project filter on the by-project tab (each row IS a project)
  const projectFilterDisabled = tab === "by-project";

  const hasFilterChanges = useMemo(
    () => eventId !== "all" || statusFilter !== "all" || typeFilter !== "all",
    [eventId, statusFilter, typeFilter]
  );

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">📊 รายงานภาพรวม</h1>
          <p className="app-page-subtitle">
            {orgName} • {formatThaiDate(fromIso)} – {formatThaiDate(toIso)}
          </p>
        </div>
      </div>

      {/* Shared filters */}
      <div className="app-filter-row">
        <DateRangePicker
          value={range}
          onChange={setRange}
          presets={["this-month", "last-month"]}
        />
        <SearchableSelect
          options={[
            { value: "all", label: "ทุกโปรเจกต์" },
            ...events.map((e) => ({ value: e.eventId, label: e.eventName })),
          ]}
          value={eventId}
          onChange={(v) => setEventId(v)}
          className="app-select"
          disabled={projectFilterDisabled}
        />
        <SearchableSelect
          options={[
            { value: "all", label: "ทุกสถานะ" },
            { value: "pending", label: "รอตรวจ" },
            { value: "approved", label: "อนุมัติแล้ว" },
            { value: "paid", label: "จ่ายแล้ว" },
            { value: "cleared", label: "เคลียร์แล้ว" },
          ]}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v)}
          className="app-select"
        />
        <SearchableSelect
          options={[
            { value: "all", label: "ทุกประเภท" },
            { value: "team", label: "เบิกเงินสด" },
            { value: "account", label: "โอนบัญชี" },
          ]}
          value={typeFilter}
          onChange={(v) => setTypeFilter(v)}
          className="app-select"
        />
        {hasFilterChanges && (
          <button
            onClick={() => {
              setEventId("all");
              setStatusFilter("all");
              setTypeFilter("all");
            }}
            className="app-btn app-btn-ghost app-btn-sm"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="app-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`app-tab ${tab === t.key ? "app-tab-active" : ""}`}
            onClick={() => handleTabChange(t.key)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {tab === "overview" && (
        <OverviewTab
          fromIso={fromIso}
          toIso={toIso}
          eventId={eventIdParam}
          status={statusParam}
          expenseType={typeParam}
        />
      )}
      {tab === "by-project" && (
        <ByProjectTab
          fromIso={fromIso}
          toIso={toIso}
          status={statusParam}
          expenseType={typeParam}
        />
      )}
      {tab === "by-vendor" && (
        <ByVendorTab
          fromIso={fromIso}
          toIso={toIso}
          eventId={eventIdParam}
          status={statusParam}
          expenseType={typeParam}
        />
      )}
    </div>
  );
}
