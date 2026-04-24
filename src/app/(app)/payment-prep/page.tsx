"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc/client";
import { PaymentModal } from "../payments/payment-modal";
import SearchableSelect, { type SearchableSelectOption } from "@/components/searchable-select";
import { fireAutoGenDoc, resolveDocTypeForPayment } from "@/lib/utils/auto-gen-doc";

type PaymentRow = {
  paymentId: string;
  eventId: string;
  payeeId: string;
  expenseType: "team" | "account";
  companyBankId: string;
  invoiceNumber: string;
  invoiceFileUrl: string;
  description: string;
  costPerUnit: number;
  days: number;
  numberOfPeople: number;
  ttlAmount: number;
  pctWTH: number;
  wthAmount: number;
  vatAmount: number;
  gttlAmount: number;
  status: string;
  paymentDate: string;
  dueDate: string;
  approvedBy: string;
  approvedAt: string;
  paidAt: string;
  batchId: string;
  isCleared: boolean;
  clearedAt: string;
  receiptUrl: string;
  documentType?: string;
  notes: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

type TabKey = "overview" | "summary" | "cash" | string; // bankId for per-bank tabs

export default function PaymentPrepPage() {
  const utils = trpc.useUtils();

  // ===== Filters =====
  const [paymentDateFrom, setPaymentDateFrom] = useState("");
  const [paymentDateTo, setPaymentDateTo] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [filterEventId, setFilterEventId] = useState("all");
  const [filterPayeeId, setFilterPayeeId] = useState("all");

  // ===== Active tab =====
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // Detail modal state
  const [viewPaymentId, setViewPaymentId] = useState<string | null>(null);

  // Expanded groups (keys: "payeeId|paymentDate")
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Selected payment IDs for batch mark-paid
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Fetch ALL approved payments
  const paymentsQuery = trpc.payment.list.useQuery({ status: "approved" });
  const eventsQuery = trpc.event.list.useQuery();
  const payeesQuery = trpc.payee.list.useQuery();
  const banksQuery = trpc.companyBank.list.useQuery();

  const allPayments = (paymentsQuery.data || []) as PaymentRow[];
  const events = eventsQuery.data || [];
  const payees = payeesQuery.data || [];
  const banks = banksQuery.data || [];

  const markPaidMut = trpc.payment.markPaid.useMutation();

  const eventMap = useMemo(
    () => Object.fromEntries(events.map((e) => [e.eventId, e.eventName])),
    [events]
  );
  const payeeMap = useMemo(
    () => Object.fromEntries(payees.map((p) => [p.payeeId, p])),
    [payees]
  );
  const bankMap = useMemo(
    () => Object.fromEntries(banks.map((b) => [b.companyBankId, b])),
    [banks]
  );

  // Apply filters
  const filteredPayments = useMemo(() => {
    return allPayments.filter((p) => {
      if (paymentDateFrom && p.paymentDate < paymentDateFrom) return false;
      if (paymentDateTo && p.paymentDate > paymentDateTo) return false;
      if (dueDateFrom && p.dueDate < dueDateFrom) return false;
      if (dueDateTo && p.dueDate > dueDateTo) return false;
      if (filterEventId !== "all" && p.eventId !== filterEventId) return false;
      if (filterPayeeId !== "all" && p.payeeId !== filterPayeeId) return false;
      return true;
    });
  }, [
    allPayments,
    paymentDateFrom,
    paymentDateTo,
    dueDateFrom,
    dueDateTo,
    filterEventId,
    filterPayeeId,
  ]);

  // ===== Bank groupings =====
  type BankGroup = {
    bankId: string;
    bankName: string;
    payments: PaymentRow[];
    total: number;
    uniquePayees: number;
  };

  const bankGroups = useMemo<BankGroup[]>(() => {
    const map = new Map<string, BankGroup>();
    for (const p of filteredPayments) {
      if (p.expenseType !== "account") continue;
      // Primary: company source bank (บัญชีต้นทาง)
      // Fallback: ถ้าไม่มี companyBankId ให้ใช้ payee's bankName (ปลายทาง) เป็น key
      // เพื่อป้องกันไม่ให้ทุกอย่างตกใน "ไม่ระบุธนาคาร"
      let bankId = p.companyBankId;
      let bankName = bankMap[bankId]?.bankName;
      if (!bankId || !bankName) {
        const payeeBankName = payeeMap[p.payeeId]?.bankName;
        if (payeeBankName) {
          bankId = `payee-bank:${payeeBankName}`;
          bankName = payeeBankName;
        } else {
          bankId = "_unknown";
          bankName = "ไม่ระบุธนาคาร";
        }
      }
      let g = map.get(bankId);
      if (!g) {
        g = {
          bankId,
          bankName,
          payments: [],
          total: 0,
          uniquePayees: 0,
        };
        map.set(bankId, g);
      }
      g.payments.push(p);
      g.total += p.gttlAmount;
    }
    for (const g of map.values()) {
      g.uniquePayees = new Set(g.payments.map((p) => p.payeeId)).size;
    }
    return Array.from(map.values()).sort((a, b) =>
      a.bankName.localeCompare(b.bankName, "th")
    );
  }, [filteredPayments, bankMap]);

  const cashPayments = useMemo(
    () => filteredPayments.filter((p) => p.expenseType === "team"),
    [filteredPayments]
  );
  const cashTotal = cashPayments.reduce((s, p) => s + p.gttlAmount, 0);

  // ===== Group by Payee + PaymentDate (Overview tab) =====
  type PayeeGroup = {
    key: string;
    payeeId: string;
    paymentDate: string;
    items: PaymentRow[];
    total: number;
  };

  const payeeGroups = useMemo<PayeeGroup[]>(() => {
    const map = new Map<string, PayeeGroup>();
    for (const p of filteredPayments) {
      const key = `${p.payeeId}|${p.paymentDate || "no-date"}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          payeeId: p.payeeId,
          paymentDate: p.paymentDate,
          items: [],
          total: 0,
        };
        map.set(key, g);
      }
      g.items.push(p);
      g.total += p.gttlAmount;
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.paymentDate !== b.paymentDate) {
        return (a.paymentDate || "zzz").localeCompare(b.paymentDate || "zzz");
      }
      return (payeeMap[a.payeeId]?.payeeName || "").localeCompare(
        payeeMap[b.payeeId]?.payeeName || "",
        "th"
      );
    });
  }, [filteredPayments, payeeMap]);

  // ===== Per-bank, per-payee summary (for bank tabs) =====
  type BankPayeeRow = {
    payeeId: string;
    payeeName: string;
    bankAccount: string;
    payeeBankName: string;
    amount: number;
    items: PaymentRow[];
    remark: string;
  };

  const buildBankPayeeRows = (bankPayments: PaymentRow[]): BankPayeeRow[] => {
    const map = new Map<string, BankPayeeRow>();
    for (const p of bankPayments) {
      const payee = payeeMap[p.payeeId];
      const key = p.payeeId;
      let r = map.get(key);
      if (!r) {
        r = {
          payeeId: p.payeeId,
          payeeName: payee?.payeeName || "-",
          bankAccount: payee?.bankAccount || "-",
          payeeBankName: payee?.bankName || "-",
          amount: 0,
          items: [],
          remark: "",
        };
        map.set(key, r);
      }
      r.items.push(p);
      r.amount += p.gttlAmount;
    }
    // Build remark: combine event names + descriptions
    for (const r of map.values()) {
      const parts = r.items.map((it) => {
        const ev = eventMap[it.eventId] || "-";
        return `${ev}_${it.description}`;
      });
      r.remark = parts.join(", ");
    }
    return Array.from(map.values()).sort((a, b) =>
      a.payeeName.localeCompare(b.payeeName, "th")
    );
  };

  // ===== Stats =====
  const totalItems = filteredPayments.length;
  const grandTotal = filteredPayments.reduce((s, p) => s + p.gttlAmount, 0);
  const uniquePayees = new Set(filteredPayments.map((p) => p.payeeId)).size;

  // ===== Selection =====
  const allFilteredIds = filteredPayments.map((p) => p.paymentId);
  const allSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const selectedTotal = filteredPayments
    .filter((p) => selected.has(p.paymentId))
    .reduce((s, p) => s + p.gttlAmount, 0);

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allFilteredIds));
  };

  const toggleItem = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (key: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroupSelect = (group: PayeeGroup) => {
    const ids = group.items.map((i) => i.paymentId);
    const allIn = ids.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      if (allIn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearFilters = () => {
    setPaymentDateFrom("");
    setPaymentDateTo("");
    setDueDateFrom("");
    setDueDateTo("");
    setFilterEventId("all");
    setFilterPayeeId("all");
  };

  const handleMarkPaidSelected = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const selectedItems = filteredPayments.filter((p) => selected.has(p.paymentId));
    const firstDate = selectedItems[0]?.paymentDate;
    if (
      !confirm(
        `ยืนยันว่าได้จ่าย ${ids.length} รายการ ยอด ฿${formatNumber(
          selectedTotal
        )} แล้ว?`
      )
    )
      return;
    try {
      await markPaidMut.mutateAsync({
        paymentIds: ids,
        paymentDate: firstDate || new Date().toISOString().slice(0, 10),
      });

      // Auto-generate + save PDF เอกสารระบบ (background, fire-and-forget)
      //   หลังจาก markPaid → trigger auto-gen ทีละรายการที่เข้าเงื่อนไข
      for (const item of selectedItems) {
        const autoType = resolveDocTypeForPayment({
          wthAmount: item.wthAmount || 0,
          documentType: item.documentType,
        });
        if (autoType) {
          console.log(`[mark-paid] auto-gen ${autoType} for ${item.paymentId}`);
          fireAutoGenDoc(item.paymentId, autoType);
        }
      }

      setSelected(new Set());
      utils.payment.list.invalidate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  // ===== Export to Excel =====
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const dateLabel = paymentDateFrom || paymentDateTo || new Date().toISOString().slice(0, 10);

    if (activeTab === "overview" || activeTab === "summary") {
      // Summary sheet
      const summaryData: Array<Record<string, string | number>> = [];
      summaryData.push({ "รายการ": `ประจำวันที่`, "ยอด (บาท)": dateLabel });
      summaryData.push({ "รายการ": "", "ยอด (บาท)": "" });
      for (const bg of bankGroups) {
        summaryData.push({
          "รายการ": `ยอด ${bg.bankName}`,
          "ยอด (บาท)": bg.total,
        });
      }
      if (cashTotal > 0) {
        summaryData.push({
          "รายการ": "ยอดเบิกเงินสด (Team Expense)",
          "ยอด (บาท)": cashTotal,
        });
      }
      summaryData.push({ "รายการ": "", "ยอด (บาท)": "" });
      summaryData.push({ "รายการ": "ยอดรวม", "ยอด (บาท)": grandTotal });

      const ws = XLSX.utils.json_to_sheet(summaryData);
      ws["!cols"] = [{ wch: 35 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, "สรุปยอดเบิก");
    }

    if (activeTab === "cash") {
      const rows = cashPayments.map((p, i) => ({
        "#": i + 1,
        "รายละเอียด": p.description,
        "โปรเจกต์": eventMap[p.eventId] || "-",
        "ผู้รับเงิน": payeeMap[p.payeeId]?.payeeName || "-",
        "ยอด (GTTL)": p.gttlAmount,
        "Due Date": p.dueDate,
        "วันจ่าย": p.paymentDate,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 5 },
        { wch: 30 },
        { wch: 20 },
        { wch: 25 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "เบิกเงินสด");
    }

    // Per-bank tab
    const currentBank = bankGroups.find((b) => b.bankId === activeTab);
    if (currentBank) {
      const payeeRows = buildBankPayeeRows(currentBank.payments);
      const rows = payeeRows.map((r, i) => ({
        "#": i + 1,
        "Account No": r.bankAccount,
        "name-sur": r.payeeName,
        "nickname": "", // nickname field not in schema yet
        "Description": "", // category field not in schema yet
        "amount": r.amount,
        "Remark": r.remark,
      }));
      rows.push({
        "#": "" as unknown as number,
        "Account No": "",
        "name-sur": "",
        "nickname": "",
        "Description": "รวม",
        "amount": currentBank.total,
        "Remark": "",
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 5 },
        { wch: 18 },
        { wch: 30 },
        { wch: 15 },
        { wch: 15 },
        { wch: 14 },
        { wch: 50 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, currentBank.bankName);
    }

    const tabLabel =
      activeTab === "overview"
        ? "ภาพรวม"
        : activeTab === "summary"
        ? "สรุปยอดเบิก"
        : activeTab === "cash"
        ? "เบิกเงินสด"
        : currentBank?.bankName || activeTab;

    XLSX.writeFile(wb, `การเตรียมจ่าย_${tabLabel}_${dateLabel}.xlsx`);
  };

  const handlePrint = () => window.print();

  const viewPayment = allPayments.find((p) => p.paymentId === viewPaymentId);

  // ===== Tab list =====
  const tabs: Array<{ id: TabKey; label: string; badge?: number }> = [
    { id: "overview", label: "📋 ภาพรวม", badge: totalItems },
    { id: "summary", label: "💰 สรุปยอดเบิก" },
    ...bankGroups.map((bg) => ({
      id: bg.bankId,
      label: `🏦 ${bg.bankName}`,
      badge: bg.payments.length,
    })),
    ...(cashPayments.length > 0
      ? [{ id: "cash" as TabKey, label: "💵 เบิกเงินสด", badge: cashPayments.length }]
      : []),
  ];

  return (
    <div className="app-page">
      <div className="app-page-header no-print">
        <div>
          <h1 className="app-page-title">🧾 การเตรียมจ่าย</h1>
          <p className="app-page-subtitle">
            รายการที่อนุมัติแล้ว พร้อมทำจ่าย — รวมตามผู้รับเงิน + วันที่จ่าย
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={handlePrint} className="app-btn app-btn-secondary">
            🖨 พิมพ์
          </button>
          <button onClick={handleExportExcel} className="app-btn app-btn-primary" style={{ background: "#16a34a", borderColor: "#16a34a" }}>
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="app-stats-grid no-print">
        <div className="app-stat-card gradient-blue">
          <div className="app-stat-icon blue">📋</div>
          <p className="app-stat-label">รายการทั้งหมด</p>
          <p className="app-stat-value-sm">{totalItems}</p>
          <p className="app-stat-sub">ที่ผ่านตัวกรอง</p>
        </div>
        <div className="app-stat-card gradient-amber">
          <div className="app-stat-icon amber">👥</div>
          <p className="app-stat-label">ผู้รับเงิน</p>
          <p className="app-stat-value-sm">{uniquePayees}</p>
          <p className="app-stat-sub">ราย</p>
        </div>
        <div className="app-stat-card gradient-green">
          <div className="app-stat-icon green">💰</div>
          <p className="app-stat-label">ยอดรวมทั้งหมด</p>
          <p className="app-stat-value-sm">฿{formatNumber(grandTotal)}</p>
          <p className="app-stat-sub">GTTL Total</p>
        </div>
        <div className="app-stat-card gradient-rose">
          <div className="app-stat-icon rose">✔</div>
          <p className="app-stat-label">เลือกจ่าย</p>
          <p className="app-stat-value-sm">{selected.size}</p>
          <p className="app-stat-sub">฿{formatNumber(selectedTotal)}</p>
        </div>
      </div>

      {/* Filters */}
      <div
        className="no-print"
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: "0.75rem",
          padding: "1rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#334155" }}>
            🔍 ตัวกรอง
          </span>
          <button
            onClick={clearFilters}
            className="app-btn app-btn-ghost app-btn-sm"
            style={{ fontSize: "0.75rem" }}
          >
            ล้างตัวกรอง
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.75rem",
          }}
        >
          <DateField label="📅 วันจ่ายตั้งแต่" value={paymentDateFrom} onChange={setPaymentDateFrom} />
          <DateField label="📅 วันจ่ายถึง" value={paymentDateTo} onChange={setPaymentDateTo} />
          <DateField label="⏰ Due Date ตั้งแต่" value={dueDateFrom} onChange={setDueDateFrom} />
          <DateField label="⏰ Due Date ถึง" value={dueDateTo} onChange={setDueDateTo} />
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>🎯 โปรเจกต์</label>
            <SearchableSelect
              options={[
                { value: "all", label: "ทุกโปรเจกต์" },
                ...events.map((e) => ({ value: e.eventId, label: e.eventName })),
              ]}
              value={filterEventId}
              onChange={(val) => setFilterEventId(val)}
              className="app-select"
              emptyLabel="ทุกโปรเจกต์"
            />
          </div>
          <div>
            <label className="app-label" style={{ fontSize: "0.75rem" }}>👤 ผู้รับเงิน</label>
            <SearchableSelect
              options={[
                { value: "all", label: "ทุกผู้รับเงิน" },
                ...payees.map((p) => ({ value: p.payeeId, label: p.payeeName })),
              ]}
              value={filterPayeeId}
              onChange={(val) => setFilterPayeeId(val)}
              className="app-select"
              emptyLabel="ทุกผู้รับเงิน"
            />
          </div>
        </div>
      </div>

      {/* Selected action bar (overview tab only) */}
      {activeTab === "overview" && selected.size > 0 && (
        <div
          className="no-print"
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "0.5rem",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "#1e3a8a", fontWeight: 500 }}>
            เลือก {selected.size} รายการ • ฿{formatNumber(selectedTotal)}
          </span>
          <button onClick={() => setSelected(new Set())} className="app-btn app-btn-ghost app-btn-sm" style={{ marginLeft: "auto" }}>
            ยกเลิกการเลือก
          </button>
          <button onClick={handleMarkPaidSelected} disabled={markPaidMut.isPending} className="app-btn app-btn-primary app-btn-sm">
            {markPaidMut.isPending ? <><span className="app-spinner" /> กำลังบันทึก...</> : `✅ บันทึกว่าจ่ายแล้ว (${selected.size})`}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="no-print" style={{ borderBottom: "1px solid #e2e8f0", marginBottom: "1rem", display: "flex", gap: "0.25rem", overflowX: "auto" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: "0.625rem 1rem",
              fontSize: "0.875rem",
              fontWeight: activeTab === t.id ? 600 : 500,
              color: activeTab === t.id ? "#2563eb" : "#64748b",
              borderBottom: activeTab === t.id ? "2px solid #2563eb" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              marginBottom: "-1px",
            }}
          >
            {t.label}{t.badge !== undefined ? ` (${t.badge})` : ""}
          </button>
        ))}
      </div>

      {/* Content per tab */}
      {paymentsQuery.isLoading ? (
        <div className="app-card"><div className="app-skeleton" style={{ height: "200px" }} /></div>
      ) : totalItems === 0 ? (
        <div className="app-card">
          <div className="app-empty">
            <div className="app-empty-icon">🧾</div>
            <p className="app-empty-title">ไม่มีรายการรอจ่าย</p>
            <p className="app-empty-desc">รายการที่อนุมัติแล้วจะปรากฏที่นี่</p>
          </div>
        </div>
      ) : activeTab === "overview" ? (
        <OverviewView
          groups={payeeGroups}
          payeeMap={payeeMap}
          eventMap={eventMap}
          bankMap={bankMap}
          selected={selected}
          expanded={expanded}
          allSelected={allSelected}
          toggleAll={toggleAll}
          toggleItem={toggleItem}
          toggleGroup={toggleGroup}
          toggleGroupSelect={toggleGroupSelect}
          onViewPayment={setViewPaymentId}
          grandTotal={grandTotal}
        />
      ) : activeTab === "summary" ? (
        <SummaryView bankGroups={bankGroups} cashTotal={cashTotal} grandTotal={grandTotal} dateLabel={paymentDateFrom || paymentDateTo} />
      ) : activeTab === "cash" ? (
        <CashView cashPayments={cashPayments} eventMap={eventMap} payeeMap={payeeMap} cashTotal={cashTotal} onViewPayment={setViewPaymentId} />
      ) : (
        (() => {
          const bank = bankGroups.find((b) => b.bankId === activeTab);
          if (!bank) return null;
          const payeeRows = buildBankPayeeRows(bank.payments);
          return <BankView bank={bank} payeeRows={payeeRows} dateLabel={paymentDateFrom || paymentDateTo} onViewPayment={setViewPaymentId} />;
        })()
      )}

      {/* View detail modal */}
      {viewPaymentId && viewPayment && (
        <PaymentModal
          payment={viewPayment}
          events={events}
          payees={payees}
          onClose={() => setViewPaymentId(null)}
          onSuccess={() => { setViewPaymentId(null); utils.payment.list.invalidate(); }}
        />
      )}

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .app-page { padding: 1rem !important; }
          .app-card, .app-table-wrap { box-shadow: none !important; border: 1px solid #000 !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

// ===== Sub-views =====

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="app-label" style={{ fontSize: "0.75rem" }}>{label}</label>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="app-input" />
    </div>
  );
}

function OverviewView(props: {
  groups: Array<{ key: string; payeeId: string; paymentDate: string; items: PaymentRow[]; total: number }>;
  payeeMap: Record<string, { payeeName: string; bankName: string; bankAccount: string }>;
  eventMap: Record<string, string>;
  bankMap: Record<string, { bankName: string }>;
  selected: Set<string>;
  expanded: Set<string>;
  allSelected: boolean;
  toggleAll: () => void;
  toggleItem: (id: string) => void;
  toggleGroup: (key: string) => void;
  toggleGroupSelect: (g: { key: string; payeeId: string; paymentDate: string; items: PaymentRow[]; total: number }) => void;
  onViewPayment: (id: string) => void;
  grandTotal: number;
}) {
  const { groups, payeeMap, eventMap, bankMap, selected, expanded, allSelected, toggleAll, toggleItem, toggleGroup, toggleGroupSelect, onViewPayment, grandTotal } = props;
  return (
    <div className="app-table-wrap">
      <table className="app-table">
        <thead>
          <tr>
            <th style={{ width: "2.5rem" }} className="no-print">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer" }} />
            </th>
            <th style={{ width: "2rem" }}></th>
            <th>ผู้รับเงิน</th>
            <th>วันจ่าย</th>
            <th>จำนวนรายการ</th>
            <th>ประเภท</th>
            <th className="text-right">ยอดรวม (GTTL)</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const payee = payeeMap[g.payeeId];
            const isExpanded = expanded.has(g.key);
            const groupIds = g.items.map((i) => i.paymentId);
            const groupAllSelected = groupIds.every((id) => selected.has(id));
            const groupSomeSelected = groupIds.some((id) => selected.has(id));
            const expenseTypes = Array.from(new Set(g.items.map((i) => i.expenseType)));
            return (
              <>
                <tr key={g.key} style={{ background: isExpanded ? "#f8fafc" : undefined, fontWeight: 500 }}>
                  <td className="no-print">
                    <input type="checkbox" checked={groupAllSelected} ref={(el) => { if (el) el.indeterminate = groupSomeSelected && !groupAllSelected; }} onChange={() => toggleGroupSelect(g)} style={{ cursor: "pointer" }} />
                  </td>
                  <td onClick={() => toggleGroup(g.key)} style={{ cursor: "pointer", textAlign: "center" }}>{isExpanded ? "▾" : "▸"}</td>
                  <td onClick={() => toggleGroup(g.key)} style={{ cursor: "pointer" }}>
                    <div>{payee?.payeeName || g.payeeId}</div>
                    {payee?.bankName && (
                      <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                        🏦 {payee.bankName}{payee.bankAccount ? ` — ${payee.bankAccount}` : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: "0.8125rem", color: "#475569" }}>{g.paymentDate ? formatDate(g.paymentDate) : "—"}</td>
                  <td style={{ fontSize: "0.8125rem" }}>{g.items.length} รายการ</td>
                  <td>
                    {expenseTypes.map((t) => (
                      <span key={t} className={`app-badge ${t === "team" ? "app-badge-warning" : "app-badge-info"}`} style={{ marginRight: "0.25rem" }}>
                        {t === "team" ? "💵 เงินสด" : "🏦 โอน"}
                      </span>
                    ))}
                  </td>
                  <td className="text-right num" style={{ fontWeight: 700, color: "#0f172a" }}>฿{formatNumber(g.total)}</td>
                </tr>
                {isExpanded && g.items.map((item) => (
                  <tr key={item.paymentId} style={{ background: "#fafbfc", fontSize: "0.8125rem" }}>
                    <td className="no-print">
                      <input type="checkbox" checked={selected.has(item.paymentId)} onChange={() => toggleItem(item.paymentId)} style={{ cursor: "pointer" }} />
                    </td>
                    <td></td>
                    <td onClick={() => onViewPayment(item.paymentId)} style={{ cursor: "pointer", paddingLeft: "1.5rem" }} title="คลิกเพื่อดูรายละเอียด">
                      <div style={{ color: "#2563eb", fontWeight: 500 }}>{item.description} 👁</div>
                      <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                        {eventMap[item.eventId] || "-"}{item.invoiceNumber ? ` • ${item.invoiceNumber}` : ""}
                      </div>
                    </td>
                    <td style={{ color: "#64748b" }}>Due: {formatDate(item.dueDate)}</td>
                    <td style={{ color: "#64748b" }}>
                      TTL ฿{formatNumber(item.ttlAmount)}
                      {item.wthAmount > 0 && (<> • WTH {item.pctWTH}% ฿{formatNumber(item.wthAmount)}</>)}
                    </td>
                    <td>
                      {item.expenseType === "account" && item.companyBankId && (
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{bankMap[item.companyBankId]?.bankName || "-"}</span>
                      )}
                    </td>
                    <td className="text-right num">฿{formatNumber(item.gttlAmount)}</td>
                  </tr>
                ))}
              </>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid #cbd5e1", fontWeight: 700 }}>
            <td colSpan={6} style={{ textAlign: "right", padding: "0.75rem" }}>รวมทั้งหมด:</td>
            <td className="text-right num" style={{ fontSize: "1rem", color: "#0f172a" }}>฿{formatNumber(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SummaryView(props: {
  bankGroups: Array<{ bankId: string; bankName: string; total: number }>;
  cashTotal: number;
  grandTotal: number;
  dateLabel: string;
}) {
  const { bankGroups, cashTotal, grandTotal, dateLabel } = props;
  const accountTotal = bankGroups.reduce((s, g) => s + g.total, 0);
  return (
    <div className="app-card" style={{ padding: "2rem" }}>
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>สรุปยอดเบิกเงิน</h2>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem", fontSize: "0.9375rem" }}>
        <span style={{ fontWeight: 500 }}>ประจำวันที่</span>
        <span>{dateLabel ? formatDate(dateLabel) : "-"}</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9375rem" }}>
        <tbody>
          {bankGroups.length > 0 && (
            <>
              <tr>
                <td style={{ padding: "0.625rem 0", fontWeight: 700 }}>ยอดโอนบัญชี (Account Expense)</td>
                <td style={{ padding: "0.625rem 0", textAlign: "right", fontWeight: 700 }}>{formatNumber(accountTotal)}</td>
              </tr>
              {bankGroups.map((g) => (
                <tr key={g.bankId}>
                  <td style={{ padding: "0.375rem 0 0.375rem 1.5rem", color: "#475569" }}>{g.bankName}</td>
                  <td style={{ padding: "0.375rem 0", textAlign: "right", color: "#475569" }}>{formatNumber(g.total)}</td>
                </tr>
              ))}
            </>
          )}
          {cashTotal > 0 && (
            <>
              <tr>
                <td style={{ padding: "0.625rem 0", fontWeight: 700, borderTop: bankGroups.length > 0 ? "1px solid #e2e8f0" : undefined }}>ยอดเบิกเงินสด (Team Expense)</td>
                <td style={{ padding: "0.625rem 0", textAlign: "right", fontWeight: 700, borderTop: bankGroups.length > 0 ? "1px solid #e2e8f0" : undefined }}>{formatNumber(cashTotal)}</td>
              </tr>
            </>
          )}
          <tr style={{ borderTop: "2px solid #0f172a" }}>
            <td style={{ padding: "0.75rem 0", fontWeight: 700, fontSize: "1.0625rem" }}>ยอดรวม</td>
            <td style={{ padding: "0.75rem 0", textAlign: "right", fontWeight: 700, fontSize: "1.0625rem" }}>{formatNumber(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CashView(props: {
  cashPayments: PaymentRow[];
  eventMap: Record<string, string>;
  payeeMap: Record<string, { payeeName: string }>;
  cashTotal: number;
  onViewPayment: (id: string) => void;
}) {
  const { cashPayments, eventMap, payeeMap, cashTotal, onViewPayment } = props;
  return (
    <div className="app-table-wrap">
      <table className="app-table">
        <thead>
          <tr>
            <th>#</th>
            <th>รายละเอียด</th>
            <th>โปรเจกต์</th>
            <th>ผู้รับเงิน</th>
            <th>Due Date</th>
            <th>วันจ่าย</th>
            <th className="text-right">ยอด (GTTL)</th>
          </tr>
        </thead>
        <tbody>
          {cashPayments.map((p, i) => (
            <tr key={p.paymentId} style={{ cursor: "pointer" }} onClick={() => onViewPayment(p.paymentId)}>
              <td>{i + 1}</td>
              <td style={{ color: "#2563eb" }}>{p.description} 👁</td>
              <td style={{ fontSize: "0.8125rem" }}>{eventMap[p.eventId] || "-"}</td>
              <td style={{ fontSize: "0.8125rem" }}>{payeeMap[p.payeeId]?.payeeName || "-"}</td>
              <td style={{ fontSize: "0.8125rem" }}>{formatDate(p.dueDate)}</td>
              <td style={{ fontSize: "0.8125rem" }}>{formatDate(p.paymentDate)}</td>
              <td className="text-right num">฿{formatNumber(p.gttlAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid #cbd5e1", fontWeight: 700 }}>
            <td colSpan={6} style={{ textAlign: "right", padding: "0.75rem" }}>รวม:</td>
            <td className="text-right num">฿{formatNumber(cashTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function BankView(props: {
  bank: { bankId: string; bankName: string; total: number; uniquePayees: number };
  payeeRows: Array<{ payeeId: string; payeeName: string; bankAccount: string; payeeBankName: string; amount: number; items: PaymentRow[]; remark: string }>;
  dateLabel: string;
  onViewPayment: (id: string) => void;
}) {
  const { bank, payeeRows, dateLabel } = props;
  return (
    <>
      <div className="app-stats-grid no-print" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="app-stat-card gradient-blue">
          <p className="app-stat-label">Payee</p>
          <p className="app-stat-value-sm">{bank.uniquePayees}</p>
        </div>
        <div className="app-stat-card gradient-green">
          <p className="app-stat-label">ยอดรวม {bank.bankName}</p>
          <p className="app-stat-value-sm">฿{formatNumber(bank.total)}</p>
        </div>
      </div>

      <div className="app-card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.875rem", alignItems: "center" }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
            ยอดโอน ธ. {bank.bankName}
          </h3>
          <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
            {dateLabel ? formatDate(dateLabel) : ""}
          </span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", border: "1px solid #cbd5e1" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={{ padding: "0.5rem", border: "1px solid #cbd5e1", textAlign: "left", width: "3rem" }}>#</th>
              <th style={{ padding: "0.5rem", border: "1px solid #cbd5e1", textAlign: "left" }}>Account No</th>
              <th style={{ padding: "0.5rem", border: "1px solid #cbd5e1", textAlign: "left" }}>name-sur</th>
              <th style={{ padding: "0.5rem", border: "1px solid #cbd5e1", textAlign: "left" }}>nickname</th>
              <th style={{ padding: "0.5rem", border: "1px solid #cbd5e1", textAlign: "left" }}>Description</th>
              <th style={{ padding: "0.5rem", border: "1px solid #cbd5e1", textAlign: "right" }}>amount</th>
              <th style={{ padding: "0.5rem", border: "1px solid #cbd5e1", textAlign: "left" }}>Remark</th>
            </tr>
          </thead>
          <tbody>
            {payeeRows.map((r, i) => (
              <tr key={r.payeeId}>
                <td style={{ padding: "0.5rem", border: "1px solid #cbd5e1" }}>{i + 1}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #cbd5e1", fontFamily: "monospace" }}>{r.bankAccount}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #cbd5e1" }}>{r.payeeName}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #cbd5e1", color: "#64748b" }}>—</td>
                <td style={{ padding: "0.5rem", border: "1px solid #cbd5e1", color: "#64748b" }}>—</td>
                <td style={{ padding: "0.5rem", border: "1px solid #cbd5e1", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(r.amount)}</td>
                <td style={{ padding: "0.5rem", border: "1px solid #cbd5e1", fontSize: "0.8125rem", color: "#475569" }}>{r.remark}</td>
              </tr>
            ))}
            <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
              <td colSpan={5} style={{ padding: "0.5rem", border: "1px solid #cbd5e1", textAlign: "right" }}>รวม</td>
              <td style={{ padding: "0.5rem", border: "1px solid #cbd5e1", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatNumber(bank.total)}</td>
              <td style={{ padding: "0.5rem", border: "1px solid #cbd5e1" }}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function formatDate(s: string): string {
  if (!s) return "-";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return s;
  }
}
