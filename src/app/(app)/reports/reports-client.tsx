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
import {
  formatThaiDate,
  toLocalDateString,
  type PaymentStatus,
  type ExpenseType,
} from "./_components";
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
  // eventId is sync'd with the URL so drill-down + share-link work after refresh.
  const eventIdFromUrl = searchParams.get("eventId");
  const [range, setRange] = useState<DateRange>(getPresetRange("this-month"));
  const [eventId, setEventId] = useState<string>(eventIdFromUrl || "all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  /**
   * Drill-down: when user clicks a project row in the by-project tab,
   * switch to the overview tab and pre-filter by that project (eventId).
   * URL is updated so the deep-link can be shared / refreshed.
   */
  function handleDrillDownToOverview(targetEventId: string) {
    setEventId(targetEventId);
    setTab("overview");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "overview");
    params.set("eventId", targetEventId);
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  }

  /** Keep ?eventId in URL in sync when the user changes the project filter manually. */
  function handleEventIdChange(next: string) {
    setEventId(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.delete("eventId");
    } else {
      params.set("eventId", next);
    }
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  }

  // ----- Lookups -----
  const eventsQuery = trpc.event.list.useQuery();
  const events = eventsQuery.data || [];

  // Use LOCAL timezone (not UTC) — fixes off-by-one day bug in ICT (UTC+7)
  const fromIso = toLocalDateString(range.from);
  const toIso = toLocalDateString(range.to);

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
          onChange={handleEventIdChange}
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
              handleEventIdChange("all");
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
          onDrillDown={handleDrillDownToOverview}
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
