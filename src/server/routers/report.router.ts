// ===========================================
// Aim Expense — Report Router
// Aggregate reports from Google Sheets (payments + events + payees)
// ===========================================
//
// Design notes
// ------------
// Reports are READ-ONLY aggregations over the org's Payments sheet, joined
// with Events (for project name) and Payees (for vendor name). All filtering
// happens in-memory after a single getPayments() pull — Google Sheets has no
// query DSL, so this is the canonical pattern (matches payment.router.ts).
//
// Date semantics:
//   - We filter on PaymentDate when present, else fall back to DueDate, else CreatedAt.
//     This way "expense-summary for April" includes:
//       (a) payments actually paid in April,
//       (b) payments scheduled to be paid in April but not yet,
//       (c) recently created drafts dated to April.
//
// Status defaults:
//   - We exclude "rejected" by default (mirrors event.router.ts list logic).
//
// Currency:
//   - All amounts use GTTLAmount (gross total = TTL - WTH + VAT). This is
//     the "actual money out the door" number used everywhere else in the app.

import { z } from "zod";
import { router, orgProcedure } from "../trpc";
import { getSheetsService } from "../lib/sheets-context";
import { SHEET_TABS } from "../services/google-sheets.service";

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** Pick the most relevant date for a payment row, normalized to YYYY-MM-DD. */
function pickRowDate(p: Record<string, string>): string {
  const raw = p.PaymentDate || p.DueDate || p.CreatedAt || "";
  // CreatedAt is ISO timestamp — slice to date portion
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

/** Safe number parse with default 0. */
function num(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// -------------------------------------------------------------------
// Schemas
// -------------------------------------------------------------------

const ExpenseSummaryInput = z.object({
  /** ISO YYYY-MM-DD inclusive */
  from: z.string().min(10),
  /** ISO YYYY-MM-DD inclusive */
  to: z.string().min(10),
  eventId: z.string().optional(),
  /** Filter by status; default = exclude "rejected" only */
  status: z
    .enum(["pending", "approved", "paid", "rejected", "cleared"])
    .optional(),
  expenseType: z.enum(["team", "account"]).optional(),
});

const ByProjectInput = z.object({
  /** ISO YYYY-MM-DD inclusive */
  from: z.string().min(10),
  /** ISO YYYY-MM-DD inclusive */
  to: z.string().min(10),
  status: z
    .enum(["pending", "approved", "paid", "rejected", "cleared"])
    .optional(),
  expenseType: z.enum(["team", "account"]).optional(),
  /** Include events with no payments in the range (default false) */
  includeEmpty: z.boolean().default(false),
});

const ByVendorInput = z.object({
  /** ISO YYYY-MM-DD inclusive */
  from: z.string().min(10),
  /** ISO YYYY-MM-DD inclusive */
  to: z.string().min(10),
  eventId: z.string().optional(),
  status: z
    .enum(["pending", "approved", "paid", "rejected", "cleared"])
    .optional(),
  expenseType: z.enum(["team", "account"]).optional(),
});

const CombinedInput = z.object({
  /** ISO YYYY-MM-DD inclusive */
  from: z.string().min(10),
  /** ISO YYYY-MM-DD inclusive */
  to: z.string().min(10),
  /** Project filter (applies to summary + byVendor; ignored for byProject) */
  eventId: z.string().optional(),
  status: z
    .enum(["pending", "approved", "paid", "rejected", "cleared"])
    .optional(),
  expenseType: z.enum(["team", "account"]).optional(),
  /** byProject only — include events with no payments in the range */
  includeEmpty: z.boolean().default(false),
});

const ClearanceInput = z.object({
  /** ISO YYYY-MM-DD inclusive — uses PaymentDate / PaidAt for "paid in range" */
  from: z.string().min(10),
  /** ISO YYYY-MM-DD inclusive */
  to: z.string().min(10),
  /** Optional project filter */
  eventId: z.string().optional(),
  /**
   * "pending"  → only items waiting to be cleared (paid + not cleared)
   * "cleared"  → only items already cleared
   * undefined  → both groups (default)
   */
  bucket: z.enum(["pending", "cleared"]).optional(),
});

const WHTInput = z.object({
  /** ISO YYYY-MM-DD inclusive — filtered by PaymentDate (date money actually went out) */
  from: z.string().min(10),
  /** ISO YYYY-MM-DD inclusive */
  to: z.string().min(10),
  /** Optional project filter */
  eventId: z.string().optional(),
  /**
   * Vendor type filter:
   *   "pnd3"  → personal (บุคคลธรรมดา) — TaxID prefix not "0", or empty
   *   "pnd53" → juristic (นิติบุคคล) — TaxID 13 digits starting with "0"
   *   undefined → return both buckets
   */
  type: z.enum(["pnd3", "pnd53"]).optional(),
});

const VatInput = z.object({
  /** ISO YYYY-MM-DD inclusive */
  from: z.string().min(10),
  /** ISO YYYY-MM-DD inclusive */
  to: z.string().min(10),
  /** Optional project filter */
  eventId: z.string().optional(),
  /**
   * Which date column drives the filter.
   *   "receiptDate" (default) — date on the tax invoice itself (Revenue Dept canonical)
   *   "paymentDate"           — date money was actually paid (cash-flow view)
   * The Revenue Dept canonical date is "วันที่ในใบกำกับภาษี" but some users want
   * to see the cash-flow view, so we support both.
   */
  dateField: z.enum(["receiptDate", "paymentDate"]).default("receiptDate"),
});

// -------------------------------------------------------------------
// Router
// -------------------------------------------------------------------

export const reportRouter = router({
  /**
   * Expense Summary — used by /reports/expense-summary
   *
   * Returns:
   *   - stats: { total, count, average, max } — KPI tiles
   *   - rows:  [{ paymentId, date, eventName, payeeName, description,
   *               expenseType, amount, status }] — DataTable rows
   */
  expenseSummary: orgProcedure
    .input(ExpenseSummaryInput)
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      // NOTE: skip ensureAllTabsExist — read-only reports rely on
      // tabs existing from onboarding. Each call adds ~7 sequential
      // Sheets API roundtrips (~3-7s). If a brand-new org somehow
      // hits a report page before onboarding finishes, we'll just
      // get an empty list, which is the correct behaviour.

      // Pull master tables in parallel (each is a single Sheets API call)
      const [payments, events, payees] = await Promise.all([
        sheets.getPayments(),
        sheets.getEvents(),
        sheets.getPayees(),
      ]);

      // Build lookup maps for join
      const eventMap = new Map(events.map((e) => [e.EventID, e.EventName]));
      const payeeMap = new Map(payees.map((p) => [p.PayeeID, p.PayeeName]));

      // Filter
      const filtered = payments.filter((p) => {
        // Status filter
        if (input.status) {
          if (p.Status !== input.status) return false;
        } else {
          // Default: exclude rejected (matches event.router behavior)
          if (p.Status === "rejected") return false;
        }
        if (input.expenseType && (p.ExpenseType || "account") !== input.expenseType) {
          return false;
        }
        if (input.eventId && p.EventID !== input.eventId) return false;

        const rowDate = pickRowDate(p);
        if (!rowDate) return false;
        if (rowDate < input.from || rowDate > input.to) return false;

        return true;
      });

      // Aggregate
      const amounts = filtered.map((p) => num(p.GTTLAmount));
      const total = amounts.reduce((s, x) => s + x, 0);
      const count = filtered.length;
      const average = count > 0 ? total / count : 0;
      const max = amounts.length > 0 ? Math.max(...amounts) : 0;

      // Shape rows for DataTable
      const rows = filtered.map((p) => ({
        paymentId: p.PaymentID,
        date: pickRowDate(p),
        eventId: p.EventID,
        eventName: eventMap.get(p.EventID) || p.EventID || "—",
        payeeId: p.PayeeID,
        payeeName: payeeMap.get(p.PayeeID) || p.PayeeID || "—",
        description: p.Description || "",
        expenseType: (p.ExpenseType || "account") as "team" | "account",
        amount: num(p.GTTLAmount),
        status: (p.Status || "pending") as
          | "pending"
          | "approved"
          | "paid"
          | "rejected"
          | "cleared",
        categoryMain: p.CategoryMain || "",
        categorySub: p.CategorySub || "",
      }));

      // Sort newest first for nicer default table view
      rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

      return {
        stats: { total, count, average, max },
        rows,
      };
    }),

  /**
   * By Project — used by /reports/by-project
   *
   * Aggregate spend per event/project within the date range.
   * Returns one row per project with budget vs spent comparison.
   *
   * Returns:
   *   - stats: { projectCount, totalBudget, totalSpent, overBudgetCount }
   *   - projects: [{ eventId, eventName, status, budget, totalSpent, remaining,
   *                  percentage, isOverBudget, paymentCount, startDate, endDate }]
   */
  byProject: orgProcedure
    .input(ByProjectInput)
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      // NOTE: skip ensureAllTabsExist — read-only reports rely on
      // tabs existing from onboarding. Each call adds ~7 sequential
      // Sheets API roundtrips (~3-7s). If a brand-new org somehow
      // hits a report page before onboarding finishes, we'll just
      // get an empty list, which is the correct behaviour.

      const [payments, events] = await Promise.all([
        sheets.getPayments(),
        sheets.getEvents(),
      ]);

      // Filter payments by date + status + type
      const filteredPayments = payments.filter((p) => {
        if (input.status) {
          if (p.Status !== input.status) return false;
        } else {
          if (p.Status === "rejected") return false;
        }
        if (input.expenseType && (p.ExpenseType || "account") !== input.expenseType) {
          return false;
        }
        const rowDate = pickRowDate(p);
        if (!rowDate) return false;
        if (rowDate < input.from || rowDate > input.to) return false;
        return true;
      });

      // Group payments by EventID
      const byEvent = new Map<string, { count: number; total: number }>();
      for (const p of filteredPayments) {
        const key = p.EventID;
        const cur = byEvent.get(key) || { count: 0, total: 0 };
        cur.count += 1;
        cur.total += num(p.GTTLAmount);
        byEvent.set(key, cur);
      }

      // Build project rows (one per event)
      const projects = events
        .map((e) => {
          const agg = byEvent.get(e.EventID) || { count: 0, total: 0 };
          const budget = num(e.Budget);
          const totalSpent = agg.total;
          const remaining = budget - totalSpent;
          const percentage = budget > 0 ? (totalSpent / budget) * 100 : 0;

          return {
            eventId: e.EventID,
            eventName: e.EventName || e.EventID || "—",
            status: e.Status || "active",
            startDate: e.StartDate || "",
            endDate: e.EndDate || "",
            budget,
            totalSpent,
            remaining,
            percentage,
            isOverBudget: budget > 0 && totalSpent > budget,
            paymentCount: agg.count,
          };
        })
        .filter((p) => input.includeEmpty || p.paymentCount > 0)
        // Sort by total spent desc (biggest spenders first)
        .sort((a, b) => b.totalSpent - a.totalSpent);

      // Aggregate stats across projects
      const projectCount = projects.length;
      const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
      const totalSpent = projects.reduce((s, p) => s + p.totalSpent, 0);
      const overBudgetCount = projects.filter((p) => p.isOverBudget).length;

      return {
        stats: { projectCount, totalBudget, totalSpent, overBudgetCount },
        projects,
      };
    }),

  /**
   * By Vendor — used by /reports (tab "แยกผู้รับเงิน")
   *
   * Aggregate spend per payee/vendor within the date range.
   * Returns one row per vendor sorted by total spent (highest first).
   *
   * Returns:
   *   - stats: { vendorCount, totalSpent, topVendorAmount, averagePerVendor }
   *   - vendors: [{ payeeId, payeeName, taxId, totalSpent, paymentCount,
   *                 lastPaymentDate, branchInfo }]
   */
  byVendor: orgProcedure
    .input(ByVendorInput)
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      // NOTE: skip ensureAllTabsExist — read-only reports rely on
      // tabs existing from onboarding. Each call adds ~7 sequential
      // Sheets API roundtrips (~3-7s). If a brand-new org somehow
      // hits a report page before onboarding finishes, we'll just
      // get an empty list, which is the correct behaviour.

      const [payments, payees] = await Promise.all([
        sheets.getPayments(),
        sheets.getPayees(),
      ]);

      // Filter payments
      const filtered = payments.filter((p) => {
        if (input.status) {
          if (p.Status !== input.status) return false;
        } else {
          if (p.Status === "rejected") return false;
        }
        if (input.expenseType && (p.ExpenseType || "account") !== input.expenseType) {
          return false;
        }
        if (input.eventId && p.EventID !== input.eventId) return false;

        const rowDate = pickRowDate(p);
        if (!rowDate) return false;
        if (rowDate < input.from || rowDate > input.to) return false;
        return true;
      });

      // Build payee lookup map (need TaxID + branch info too)
      const payeeMap = new Map(
        payees.map((p) => [
          p.PayeeID,
          {
            name: p.PayeeName || p.PayeeID,
            taxId: p.TaxID || "",
            branchType: p.BranchType || "",
            branchNumber: p.BranchNumber || "",
          },
        ])
      );

      // Group by payee
      type Agg = {
        total: number;
        count: number;
        lastDate: string;
      };
      const byPayee = new Map<string, Agg>();
      for (const p of filtered) {
        const key = p.PayeeID;
        const cur = byPayee.get(key) || { total: 0, count: 0, lastDate: "" };
        cur.total += num(p.GTTLAmount);
        cur.count += 1;
        const d = pickRowDate(p);
        if (d > cur.lastDate) cur.lastDate = d;
        byPayee.set(key, cur);
      }

      // Build vendor rows
      const vendors = Array.from(byPayee.entries())
        .map(([payeeId, agg]) => {
          const info = payeeMap.get(payeeId);
          const branchInfo =
            info?.branchType === "Branch" && info.branchNumber
              ? `สาขา ${info.branchNumber}`
              : info?.branchType === "HQ"
              ? "สำนักงานใหญ่"
              : "";
          return {
            payeeId,
            payeeName: info?.name || payeeId,
            taxId: info?.taxId || "",
            branchInfo,
            totalSpent: agg.total,
            paymentCount: agg.count,
            lastPaymentDate: agg.lastDate,
          };
        })
        .sort((a, b) => b.totalSpent - a.totalSpent);

      // Stats
      const vendorCount = vendors.length;
      const totalSpent = vendors.reduce((s, v) => s + v.totalSpent, 0);
      const topVendorAmount = vendors[0]?.totalSpent ?? 0;
      const averagePerVendor = vendorCount > 0 ? totalSpent / vendorCount : 0;

      return {
        stats: { vendorCount, totalSpent, topVendorAmount, averagePerVendor },
        vendors,
      };
    }),

  /**
   * Combined Reports — single-query aggregator used by /reports.
   *
   * Why: the unified /reports page has 3 tabs (overview/byProject/byVendor).
   * Calling 3 separate procedures means 3× HTTP roundtrips and 3× duplicate
   * Sheets API pulls of the same `getPayments()`. This procedure pulls master
   * tables ONCE then aggregates all 3 views in-memory in a single response.
   *
   * Result: tab-switch on /reports is instant (data already in client cache),
   * and initial load is roughly half the wall-clock time of the old approach.
   *
   * Returns: { summary, byProject, byVendor } — same shape as the individual
   * procedures (intentional, so each tab component can keep its existing typings).
   */
  combined: orgProcedure
    .input(CombinedInput)
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      // NOTE: skip ensureAllTabsExist — read-only reports rely on
      // tabs existing from onboarding. Each call adds ~7 sequential
      // Sheets API roundtrips (~3-7s). If a brand-new org somehow
      // hits a report page before onboarding finishes, we'll just
      // get an empty list, which is the correct behaviour.

      // Pull master tables ONCE in parallel (3 calls for the whole page)
      const [payments, events, payees] = await Promise.all([
        sheets.getPayments(),
        sheets.getEvents(),
        sheets.getPayees(),
      ]);

      // Lookup maps
      const eventMap = new Map(events.map((e) => [e.EventID, e.EventName]));
      const payeeMap = new Map(
        payees.map((p) => [
          p.PayeeID,
          {
            name: p.PayeeName || p.PayeeID,
            taxId: p.TaxID || "",
            branchType: p.BranchType || "",
            branchNumber: p.BranchNumber || "",
          },
        ])
      );

      // Shared filter helpers — applied to "summary" + "byVendor"
      function inDate(p: Record<string, string>): boolean {
        const rowDate = pickRowDate(p);
        if (!rowDate) return false;
        return rowDate >= input.from && rowDate <= input.to;
      }
      function passStatus(p: Record<string, string>): boolean {
        if (input.status) return p.Status === input.status;
        return p.Status !== "rejected";
      }
      function passType(p: Record<string, string>): boolean {
        if (!input.expenseType) return true;
        return (p.ExpenseType || "account") === input.expenseType;
      }

      // ===== 1) Summary (overview) — eventId filter applies =====
      const summaryFiltered = payments.filter((p) => {
        if (!passStatus(p)) return false;
        if (!passType(p)) return false;
        if (input.eventId && p.EventID !== input.eventId) return false;
        if (!inDate(p)) return false;
        return true;
      });

      const summaryAmounts = summaryFiltered.map((p) => num(p.GTTLAmount));
      const summaryTotal = summaryAmounts.reduce((s, x) => s + x, 0);
      const summaryCount = summaryFiltered.length;
      const summaryAverage = summaryCount > 0 ? summaryTotal / summaryCount : 0;
      const summaryMax =
        summaryAmounts.length > 0 ? Math.max(...summaryAmounts) : 0;

      const summaryRows = summaryFiltered
        .map((p) => ({
          paymentId: p.PaymentID,
          date: pickRowDate(p),
          eventId: p.EventID,
          eventName: eventMap.get(p.EventID) || p.EventID || "—",
          payeeId: p.PayeeID,
          payeeName: payeeMap.get(p.PayeeID)?.name || p.PayeeID || "—",
          description: p.Description || "",
          expenseType: (p.ExpenseType || "account") as "team" | "account",
          amount: num(p.GTTLAmount),
          status: (p.Status || "pending") as
            | "pending"
            | "approved"
            | "paid"
            | "rejected"
            | "cleared",
          categoryMain: p.CategoryMain || "",
          categorySub: p.CategorySub || "",
        }))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

      // ===== 2) By Project — eventId filter does NOT apply (each row IS a project) =====
      const byProjectFiltered = payments.filter((p) => {
        if (!passStatus(p)) return false;
        if (!passType(p)) return false;
        if (!inDate(p)) return false;
        return true;
      });

      const byEvent = new Map<string, { count: number; total: number }>();
      for (const p of byProjectFiltered) {
        const cur = byEvent.get(p.EventID) || { count: 0, total: 0 };
        cur.count += 1;
        cur.total += num(p.GTTLAmount);
        byEvent.set(p.EventID, cur);
      }

      const projects = events
        .map((e) => {
          const agg = byEvent.get(e.EventID) || { count: 0, total: 0 };
          const budget = num(e.Budget);
          const totalSpent = agg.total;
          const remaining = budget - totalSpent;
          const percentage = budget > 0 ? (totalSpent / budget) * 100 : 0;
          return {
            eventId: e.EventID,
            eventName: e.EventName || e.EventID || "—",
            status: e.Status || "active",
            startDate: e.StartDate || "",
            endDate: e.EndDate || "",
            budget,
            totalSpent,
            remaining,
            percentage,
            isOverBudget: budget > 0 && totalSpent > budget,
            paymentCount: agg.count,
          };
        })
        .filter((p) => input.includeEmpty || p.paymentCount > 0)
        .sort((a, b) => b.totalSpent - a.totalSpent);

      const byProjectStats = {
        projectCount: projects.length,
        totalBudget: projects.reduce((s, p) => s + p.budget, 0),
        totalSpent: projects.reduce((s, p) => s + p.totalSpent, 0),
        overBudgetCount: projects.filter((p) => p.isOverBudget).length,
      };

      // ===== 3) By Vendor — eventId filter applies =====
      // Reuse summaryFiltered (same filter rules: status + type + eventId + date)
      type VendorAgg = { total: number; count: number; lastDate: string };
      const byPayee = new Map<string, VendorAgg>();
      for (const p of summaryFiltered) {
        const cur = byPayee.get(p.PayeeID) || {
          total: 0,
          count: 0,
          lastDate: "",
        };
        cur.total += num(p.GTTLAmount);
        cur.count += 1;
        const d = pickRowDate(p);
        if (d > cur.lastDate) cur.lastDate = d;
        byPayee.set(p.PayeeID, cur);
      }

      const vendors = Array.from(byPayee.entries())
        .map(([payeeId, agg]) => {
          const info = payeeMap.get(payeeId);
          const branchInfo =
            info?.branchType === "Branch" && info.branchNumber
              ? `สาขา ${info.branchNumber}`
              : info?.branchType === "HQ"
              ? "สำนักงานใหญ่"
              : "";
          return {
            payeeId,
            payeeName: info?.name || payeeId,
            taxId: info?.taxId || "",
            branchInfo,
            totalSpent: agg.total,
            paymentCount: agg.count,
            lastPaymentDate: agg.lastDate,
          };
        })
        .sort((a, b) => b.totalSpent - a.totalSpent);

      const byVendorStats = {
        vendorCount: vendors.length,
        totalSpent: vendors.reduce((s, v) => s + v.totalSpent, 0),
        topVendorAmount: vendors[0]?.totalSpent ?? 0,
        averagePerVendor:
          vendors.length > 0
            ? vendors.reduce((s, v) => s + v.totalSpent, 0) / vendors.length
            : 0,
      };

      return {
        summary: {
          stats: {
            total: summaryTotal,
            count: summaryCount,
            average: summaryAverage,
            max: summaryMax,
          },
          rows: summaryRows,
        },
        byProject: {
          stats: byProjectStats,
          projects,
        },
        byVendor: {
          stats: byVendorStats,
          vendors,
        },
      };
    }),

  /**
   * Clearance Report — used by /reports/clearance
   *
   * "เคลียร์งบ" = the reconciliation step for Team Expenses (cash advances).
   * After a Team Expense is paid, the staff member must come back with
   * receipts → mark as "cleared". This report tracks:
   *   - what's still waiting to be cleared (status=paid, IsCleared!="TRUE")
   *   - what's already cleared (status=cleared)
   *
   * Date semantics: filter by "PaymentDate || PaidAt slice 0-10" — i.e.
   * when the cash advance was actually paid out, not when it was created.
   * This matches the user's mental model: "ที่จ่ายไปเดือนนี้ เคลียร์ครบหรือยัง"
   *
   * NOTE: only Team Expenses (`ExpenseType="team"`) qualify — Account
   * expenses are direct vendor transfers and don't need reconciliation.
   *
   * Returns:
   *   - stats: { pendingCount, pendingAmount, clearedCount, clearedAmount,
   *              overdueCount, overdueAmount, averageDaysToClear }
   *   - pending:  rows waiting to be cleared (sorted by daysSincePaid desc)
   *   - cleared:  rows already cleared (sorted by clearedAt desc)
   */
  clearance: orgProcedure
    .input(ClearanceInput)
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      // NOTE: skip ensureAllTabsExist — read-only reports rely on
      // tabs existing from onboarding. Each call adds ~7 sequential
      // Sheets API roundtrips (~3-7s). If a brand-new org somehow
      // hits a report page before onboarding finishes, we'll just
      // get an empty list, which is the correct behaviour.

      const [payments, events, payees] = await Promise.all([
        sheets.getPayments(),
        sheets.getEvents(),
        sheets.getPayees(),
      ]);

      const eventMap = new Map(events.map((e) => [e.EventID, e.EventName]));
      const payeeMap = new Map(payees.map((p) => [p.PayeeID, p.PayeeName]));

      /** Use PaymentDate (preferred) → PaidAt slice → empty */
      function paidDateOf(p: Record<string, string>): string {
        if (p.PaymentDate) return p.PaymentDate;
        if (p.PaidAt && p.PaidAt.length >= 10) return p.PaidAt.slice(0, 10);
        return "";
      }

      /** Days between two YYYY-MM-DD dates (b - a). Negative if a > b. */
      function daysBetween(a: string, b: string): number {
        if (!a || !b) return 0;
        const da = new Date(a + "T00:00:00").getTime();
        const db = new Date(b + "T00:00:00").getTime();
        return Math.floor((db - da) / 86_400_000);
      }

      // Today (server local) — used for daysSincePaid on pending rows
      const today = (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      })();

      type PendingRow = {
        paymentId: string;
        paidDate: string;
        eventId: string;
        eventName: string;
        payeeId: string;
        payeeName: string;
        description: string;
        amount: number;
        daysSincePaid: number;
        isOverdue: boolean; // > 14 days = overdue (configurable later)
        notes: string;
      };

      type ClearedRow = {
        paymentId: string;
        paidDate: string;
        clearedAt: string; // YYYY-MM-DD
        eventId: string;
        eventName: string;
        payeeId: string;
        payeeName: string;
        description: string;
        amount: number;
        daysToClear: number;
        receiptUrl: string;
      };

      const OVERDUE_THRESHOLD_DAYS = 14;

      const pending: PendingRow[] = [];
      const cleared: ClearedRow[] = [];

      for (const p of payments) {
        // Only Team Expenses qualify for clearance
        if ((p.ExpenseType || "account") !== "team") continue;
        // Apply project filter
        if (input.eventId && p.EventID !== input.eventId) continue;

        const paidDate = paidDateOf(p);
        const isCleared =
          p.IsCleared === "TRUE" || p.Status === "cleared";

        // ----- Cleared bucket -----
        if (isCleared) {
          // Filter by clearance/payment date in range
          if (!paidDate) continue;
          if (paidDate < input.from || paidDate > input.to) continue;

          const clearedAtRaw = p.ClearedAt || "";
          const clearedAt =
            clearedAtRaw.length >= 10 ? clearedAtRaw.slice(0, 10) : "";

          cleared.push({
            paymentId: p.PaymentID,
            paidDate,
            clearedAt,
            eventId: p.EventID,
            eventName: eventMap.get(p.EventID) || p.EventID || "—",
            payeeId: p.PayeeID,
            payeeName: payeeMap.get(p.PayeeID) || p.PayeeID || "—",
            description: p.Description || "",
            amount: num(p.GTTLAmount),
            daysToClear: clearedAt ? daysBetween(paidDate, clearedAt) : 0,
            receiptUrl: p.ReceiptURL || "",
          });
          continue;
        }

        // ----- Pending bucket: must be paid + NOT cleared -----
        if (p.Status !== "paid") continue;
        if (!paidDate) continue;
        if (paidDate < input.from || paidDate > input.to) continue;

        const days = daysBetween(paidDate, today);
        pending.push({
          paymentId: p.PaymentID,
          paidDate,
          eventId: p.EventID,
          eventName: eventMap.get(p.EventID) || p.EventID || "—",
          payeeId: p.PayeeID,
          payeeName: payeeMap.get(p.PayeeID) || p.PayeeID || "—",
          description: p.Description || "",
          amount: num(p.GTTLAmount),
          daysSincePaid: Math.max(0, days),
          isOverdue: days > OVERDUE_THRESHOLD_DAYS,
          notes: p.Notes || "",
        });
      }

      // Sort: pending → most overdue first; cleared → most recent first
      pending.sort((a, b) => b.daysSincePaid - a.daysSincePaid);
      cleared.sort((a, b) =>
        a.clearedAt < b.clearedAt ? 1 : a.clearedAt > b.clearedAt ? -1 : 0
      );

      // Stats
      const pendingCount = pending.length;
      const pendingAmount = pending.reduce((s, r) => s + r.amount, 0);
      const clearedCount = cleared.length;
      const clearedAmount = cleared.reduce((s, r) => s + r.amount, 0);
      const overdue = pending.filter((r) => r.isOverdue);
      const overdueCount = overdue.length;
      const overdueAmount = overdue.reduce((s, r) => s + r.amount, 0);
      const averageDaysToClear =
        cleared.length > 0
          ? cleared.reduce((s, r) => s + r.daysToClear, 0) / cleared.length
          : 0;

      // Apply optional bucket filter on response shape
      const responsePending =
        input.bucket === "cleared" ? [] : pending;
      const responseCleared =
        input.bucket === "pending" ? [] : cleared;

      return {
        stats: {
          pendingCount,
          pendingAmount,
          clearedCount,
          clearedAmount,
          overdueCount,
          overdueAmount,
          averageDaysToClear,
          overdueThresholdDays: OVERDUE_THRESHOLD_DAYS,
        },
        pending: responsePending,
        cleared: responseCleared,
      };
    }),

  // NOTE: `weeklyPayment` procedure was removed in S19 (orphan cleanup).
  // It lived alongside the now-deleted /reports/weekly-payment page +
  // src/lib/utils/bank-csv.ts helper. The /payment-prep workflow page
  // already covers per-bank batching + Excel export, so the duplicate
  // was retired. See git history at commit e9ba6e8 if needed.

  /**
   * Withholding Tax Report — used by /reports/wht (ภงด.3 + ภงด.53)
   *
   * Filing context (Thai tax law):
   *   - **ภ.ง.ด.3** (form PND3) = WHT certificate aggregator for **personal**
   *     income recipients (บุคคลธรรมดา). Filed monthly with the Revenue Dept
   *     within 7 days of month-end.
   *   - **ภ.ง.ด.53** (form PND53) = same, but for **juristic** recipients
   *     (นิติบุคคล — บริษัท / หจก. / มูลนิธิ). Same filing cadence.
   *
   * Vendor type detection (Thai TaxID rule):
   *   - Juristic entities use a 13-digit Tax ID starting with "0".
   *   - Individuals use their 13-digit national ID (starts with 1–8).
   *   - We use `TaxID.startsWith("0") && length === 13` → juristic (pnd53).
   *     Anything else (incl. empty TaxID) → personal (pnd3, the default
   *     bucket — Revenue Dept treats no-TaxID payees as personal income).
   *
   * Filter rules:
   *   - status === "paid" only (Revenue Dept files are based on actual cash-out,
   *     not approvals).
   *   - WTHAmount > 0 (no point listing rows with no withholding).
   *   - Date filter on PaymentDate (fall back to PaidAt slice).
   *
   * Read-only aggregation per SYSTEM_REQUIREMENTS principle 3 — no caching.
   *
   * Returns:
   *   - stats:    overall { totalCount, totalIncome, totalWHT, payeeCount } across both buckets
   *   - pnd3:     { stats: {...}, rows: [...] } — personal recipients
   *   - pnd53:    { stats: {...}, rows: [...] } — juristic recipients
   *
   * The page can render either bucket via the `type` filter, or both at once
   * (default — UI uses tabs to flip between them without refetching).
   */
  wht: orgProcedure
    .input(WHTInput)
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      // NOTE: skip ensureAllTabsExist (read-only — same as other reports).

      const [payments, events, payees] = await Promise.all([
        sheets.getPayments(),
        sheets.getEvents(),
        sheets.getPayees(),
      ]);

      const eventMap = new Map(events.map((e) => [e.EventID, e.EventName]));
      const payeeMap = new Map(
        payees.map((p) => [
          p.PayeeID,
          {
            name: p.PayeeName || p.PayeeID,
            taxId: p.TaxID || "",
            branchType: p.BranchType || "",
            branchNumber: p.BranchNumber || "",
            address: p.Address || "",
            isVAT: p.IsVAT || "",
          },
        ]),
      );

      /** Pick the date money went out (PaymentDate preferred, PaidAt fallback). */
      function paidDateOf(p: Record<string, string>): string {
        if (p.PaymentDate) return p.PaymentDate;
        if (p.PaidAt && p.PaidAt.length >= 10) return p.PaidAt.slice(0, 10);
        return "";
      }

      /**
       * Classify a payee by Tax ID prefix per Thai standard.
       *   - Juristic (นิติบุคคล) → 13-digit TaxID starting with "0" → ภงด.53
       *   - Personal (บุคคลธรรมดา) → anything else (incl. empty TaxID) → ภงด.3
       */
      function vendorTypeOf(taxId: string): "pnd3" | "pnd53" {
        if (taxId && taxId.length === 13 && taxId.startsWith("0")) {
          return "pnd53";
        }
        return "pnd3";
      }

      /**
       * Format a Thai branch label per Revenue Dept convention.
       *   - HQ (สำนักงานใหญ่)   → "00000"
       *   - Branch with number → 5-digit zero-padded
       *   - Empty / unknown    → ""
       */
      function branchLabelOf(
        branchType: string,
        branchNumber: string,
      ): string {
        if (branchType === "HQ") return "00000";
        if (branchType === "Branch" && branchNumber) {
          // already 5 digits in spec but defensive pad
          return branchNumber.padStart(5, "0");
        }
        return "";
      }

      type WHTRow = {
        // Identity
        paymentId: string;
        paidDate: string; // YYYY-MM-DD
        payeeId: string;
        payeeName: string;
        taxId: string;
        branchLabel: string; // "00000" / "00001" / ""
        address: string;
        // Project context
        eventId: string;
        eventName: string;
        // Form fields (per Revenue Dept ใบแนบ ภงด.3/53 spec)
        incomeType: string; // ประเภทเงินได้ (Description / CategoryMain — user-facing label)
        rate: number; // อัตราภาษีร้อยละ — derived from PctWTH
        incomeAmount: number; // จำนวนเงินที่จ่าย (TTLAmount — pre-WHT base)
        whtAmount: number; // ภาษีหัก ณ ที่จ่าย (WTHAmount)
        condition: number; // เงื่อนไข — default 1 (หัก ณ ที่จ่าย); 2/3 not yet captured
        // Auxiliary (for cross-reference)
        invoiceNumber: string;
        description: string; // raw description (mirrors incomeType when no category set)
      };

      const rowsAll: WHTRow[] = [];

      for (const p of payments) {
        // Status filter — paid only
        if (p.Status !== "paid") continue;

        const wth = num(p.WTHAmount);
        if (wth <= 0) continue;

        // Project filter
        if (input.eventId && p.EventID !== input.eventId) continue;

        const paidDate = paidDateOf(p);
        if (!paidDate) continue;
        if (paidDate < input.from || paidDate > input.to) continue;

        const info = payeeMap.get(p.PayeeID);
        const taxId = info?.taxId || p.VendorTaxIdSnapshot || "";

        const incomeAmount = num(p.TTLAmount);
        const rate = num(p.PctWTH);
        const incomeType =
          p.CategoryMain ||
          p.Description ||
          "ค่าบริการ"; // safe default for Revenue Dept categorization

        rowsAll.push({
          paymentId: p.PaymentID,
          paidDate,
          payeeId: p.PayeeID,
          payeeName: info?.name || p.PayeeID || "—",
          taxId,
          branchLabel: branchLabelOf(
            info?.branchType || "",
            info?.branchNumber || "",
          ),
          address: info?.address || "",
          eventId: p.EventID,
          eventName: eventMap.get(p.EventID) || p.EventID || "—",
          incomeType,
          rate,
          incomeAmount,
          whtAmount: wth,
          condition: 1, // 1 = หัก ณ ที่จ่าย (default — system doesn't yet capture 2/3)
          invoiceNumber: p.InvoiceNumber || "",
          description: p.Description || "",
        });
      }

      // Split into pnd3 / pnd53 buckets by vendor type
      const pnd3Rows: WHTRow[] = [];
      const pnd53Rows: WHTRow[] = [];
      for (const r of rowsAll) {
        if (vendorTypeOf(r.taxId) === "pnd53") {
          pnd53Rows.push(r);
        } else {
          pnd3Rows.push(r);
        }
      }

      // Sort: paidDate asc, then payeeName (Thai locale)
      function sortRows(rows: WHTRow[]) {
        rows.sort((a, b) => {
          if (a.paidDate !== b.paidDate)
            return a.paidDate < b.paidDate ? -1 : 1;
          return a.payeeName.localeCompare(b.payeeName, "th");
        });
      }
      sortRows(pnd3Rows);
      sortRows(pnd53Rows);

      function statsOf(rows: WHTRow[]) {
        const totalIncome = rows.reduce((s, r) => s + r.incomeAmount, 0);
        const totalWHT = rows.reduce((s, r) => s + r.whtAmount, 0);
        const payeeIds = new Set(rows.map((r) => r.payeeId));
        return {
          totalCount: rows.length,
          totalIncome,
          totalWHT,
          payeeCount: payeeIds.size,
        };
      }

      const pnd3Stats = statsOf(pnd3Rows);
      const pnd53Stats = statsOf(pnd53Rows);
      const overallStats = {
        totalCount: pnd3Stats.totalCount + pnd53Stats.totalCount,
        totalIncome: pnd3Stats.totalIncome + pnd53Stats.totalIncome,
        totalWHT: pnd3Stats.totalWHT + pnd53Stats.totalWHT,
        payeeCount: new Set(rowsAll.map((r) => r.payeeId)).size,
      };

      // If caller filtered to a specific bucket, return only that one's rows
      // (the other bucket still ships its stats so badges render zero counts).
      const filtered = {
        pnd3:
          input.type === "pnd53"
            ? { stats: pnd3Stats, rows: [] as WHTRow[] }
            : { stats: pnd3Stats, rows: pnd3Rows },
        pnd53:
          input.type === "pnd3"
            ? { stats: pnd53Stats, rows: [] as WHTRow[] }
            : { stats: pnd53Stats, rows: pnd53Rows },
      };

      return {
        stats: overallStats,
        ...filtered,
      };
    }),

  /**
   * Purchase VAT Report (รายงานภาษีซื้อ) — used by /reports/vat
   *
   * Filing context (Thai tax law):
   *   - VAT-registered businesses must file ภ.พ.30 monthly. The form aggregates:
   *       (a) Output VAT — VAT charged on SALES (not yet captured by Aim Expense)
   *       (b) Input VAT  — VAT paid on PURCHASES (this report)
   *   - This procedure produces the "รายงานภาษีซื้อ" attachment that supports
   *     the Input VAT line on ภ.พ.30. Once a sales/quotation module ships,
   *     a future procedure will combine both halves into the full ภ.พ.30 view.
   *
   * Filter rules:
   *   - status === "paid" (matches WHT logic — Revenue Dept reports are based on
   *     actual booked entries; we treat status=paid as "settled enough to claim
   *     the input VAT credit"). This may need to relax to include "approved"
   *     once accountants ask for accrual-style views.
   *   - DocumentType === "tax_invoice" — only ใบกำกับภาษี qualifies. Plain
   *     receipts (DocumentType="receipt") and rows where the field is empty are
   *     excluded — Revenue Dept will not let you claim VAT credit without one.
   *   - VATAmount > 0 — defensive; some payees are flagged ไม่จดทะเบียน VAT.
   *
   * Date filter:
   *   - Driven by `input.dateField`:
   *       "receiptDate"  → ReceiptDate (canonical: date on the invoice itself)
   *       "paymentDate"  → PaymentDate / PaidAt (cash-flow view)
   *   - Empty source date → row excluded (cannot place it on a calendar).
   *
   * Read-only aggregation per SYSTEM_REQUIREMENTS principle 3 — no caching.
   *
   * Returns:
   *   - stats: { totalCount, totalBase, totalVAT, vendorCount }
   *   - rows:  one entry per qualifying payment, sorted by date asc then vendor name
   */
  vat: orgProcedure
    .input(VatInput)
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      // NOTE: skip ensureAllTabsExist (read-only — same as other reports).

      const [payments, events, payees] = await Promise.all([
        sheets.getPayments(),
        sheets.getEvents(),
        sheets.getPayees(),
      ]);

      const eventMap = new Map(events.map((e) => [e.EventID, e.EventName]));
      const payeeMap = new Map(
        payees.map((p) => [
          p.PayeeID,
          {
            name: p.PayeeName || p.PayeeID,
            taxId: p.TaxID || "",
            branchType: p.BranchType || "",
            branchNumber: p.BranchNumber || "",
            address: p.Address || "",
            isVAT: p.IsVAT || "",
          },
        ]),
      );

      /** Branch label per Revenue Dept convention. */
      function branchLabelOf(
        branchType: string,
        branchNumber: string,
      ): string {
        if (branchType === "HQ") return "00000";
        if (branchType === "Branch" && branchNumber) {
          return branchNumber.padStart(5, "0");
        }
        return "";
      }

      /** Pick the date used for filtering, normalized to YYYY-MM-DD. */
      function pickDate(p: Record<string, string>): string {
        if (input.dateField === "paymentDate") {
          if (p.PaymentDate) return p.PaymentDate;
          if (p.PaidAt && p.PaidAt.length >= 10) return p.PaidAt.slice(0, 10);
          return "";
        }
        // default: receiptDate
        if (p.ReceiptDate) return p.ReceiptDate;
        return "";
      }

      type VatRow = {
        // Identity
        paymentId: string;
        date: string; // YYYY-MM-DD (whichever dateField was selected)
        receiptDate: string; // raw — for cross-check display
        paymentDate: string; // raw — for cross-check display
        // Document
        invoiceNumber: string;
        receiptNumber: string;
        // Vendor
        payeeId: string;
        payeeName: string;
        taxId: string;
        branchLabel: string;
        address: string;
        // Project
        eventId: string;
        eventName: string;
        // Amounts
        baseAmount: number; // ฐานภาษี (TTLAmount = pre-VAT amount)
        vatAmount: number; // ภาษีซื้อ (VATAmount)
        // Auxiliary
        description: string;
        expenseNature: string; // "goods" | "service" | ""
      };

      const rows: VatRow[] = [];

      for (const p of payments) {
        // Status filter — paid only
        if (p.Status !== "paid") continue;

        // Document type filter — only tax invoices qualify for input VAT credit
        if (p.DocumentType !== "tax_invoice") continue;

        // VAT amount must be positive
        const vatAmount = num(p.VATAmount);
        if (vatAmount <= 0) continue;

        // Project filter
        if (input.eventId && p.EventID !== input.eventId) continue;

        // Date filter
        const date = pickDate(p);
        if (!date) continue;
        if (date < input.from || date > input.to) continue;

        const info = payeeMap.get(p.PayeeID);
        const taxId = info?.taxId || p.VendorTaxIdSnapshot || "";

        rows.push({
          paymentId: p.PaymentID,
          date,
          receiptDate: p.ReceiptDate || "",
          paymentDate: p.PaymentDate || (p.PaidAt ? p.PaidAt.slice(0, 10) : ""),
          invoiceNumber: p.InvoiceNumber || "",
          receiptNumber: p.ReceiptNumber || "",
          payeeId: p.PayeeID,
          payeeName: info?.name || p.PayeeID || "—",
          taxId,
          branchLabel: branchLabelOf(
            info?.branchType || "",
            info?.branchNumber || "",
          ),
          address: info?.address || "",
          eventId: p.EventID,
          eventName: eventMap.get(p.EventID) || p.EventID || "—",
          baseAmount: num(p.TTLAmount),
          vatAmount,
          description: p.Description || "",
          expenseNature: p.ExpenseNature || "",
        });
      }

      // Sort: date asc, then payeeName (Thai locale)
      rows.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return a.payeeName.localeCompare(b.payeeName, "th");
      });

      const totalBase = rows.reduce((s, r) => s + r.baseAmount, 0);
      const totalVAT = rows.reduce((s, r) => s + r.vatAmount, 0);
      const vendorCount = new Set(rows.map((r) => r.payeeId)).size;

      return {
        stats: {
          totalCount: rows.length,
          totalBase,
          totalVAT,
          vendorCount,
        },
        rows,
      };
    }),

  /**
   * VAT Sales report (ภาษีขาย) — Output VAT side of ภ.พ.30 (S25B Phase 2).
   *
   * Source: TaxInvoices + TaxInvoiceLines (status="issued", in date range).
   * Voided TIs are excluded (no output VAT to report); drafts are excluded
   * (no DocNumber yet).
   *
   * Date field: DocDate of the tax invoice (canonical "วันที่ในใบกำกับภาษี").
   *
   * Aggregation:
   *   - per-document totals from header (Subtotal, VATAmount)
   *   - per-line goods/service split (sums of LineTotals — pre-VAT base by nature)
   *
   * Returns:
   *   - stats: counts + total base + total VAT + customer count + goods/service split
   *   - rows:  one entry per qualifying tax invoice, sorted by date asc
   */
  vatSales: orgProcedure
    .input(
      z.object({
        from: z.string().min(10),
        to: z.string().min(10),
        customerId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);
      const batch = await sheets.getAllBatch([
        SHEET_TABS.TAX_INVOICES,
        SHEET_TABS.TAX_INVOICE_LINES,
      ]);
      const headers = batch[SHEET_TABS.TAX_INVOICES] || [];
      const allLines = batch[SHEET_TABS.TAX_INVOICE_LINES] || [];

      type SalesRow = {
        taxInvoiceId: string;
        docNumber: string;
        docDate: string;
        customerId: string;
        customerName: string;
        customerTaxId: string;
        customerBranch: string;
        projectName: string;
        baseAmount: number; // ฐานภาษี (subtotal pre-VAT, post-discount)
        vatAmount: number; // ภาษีขาย (output VAT)
        // Per-nature base (sums of LineTotals by ExpenseNature, pre-discount)
        goodsBase: number;
        serviceBase: number;
      };

      const rows: SalesRow[] = [];

      for (const h of headers) {
        if (h.Status !== "issued") continue;
        if (!h.DocDate) continue;
        if (h.DocDate < input.from || h.DocDate > input.to) continue;
        if (input.customerId && h.CustomerID !== input.customerId) continue;

        const linesForDoc = allLines.filter(
          (l) => l.TaxInvoiceID === h.TaxInvoiceID,
        );
        const goodsBase = linesForDoc
          .filter((l) => l.ExpenseNature === "goods")
          .reduce((s, l) => s + num(l.LineTotal), 0);
        const serviceBase = linesForDoc
          .filter(
            (l) => l.ExpenseNature !== "goods", // service or empty
          )
          .reduce((s, l) => s + num(l.LineTotal), 0);

        rows.push({
          taxInvoiceId: h.TaxInvoiceID,
          docNumber: h.DocNumber || "",
          docDate: h.DocDate,
          customerId: h.CustomerID,
          customerName: h.CustomerNameSnapshot || h.CustomerID || "—",
          customerTaxId: h.CustomerTaxIdSnapshot || "",
          customerBranch: h.CustomerBranchSnapshot || "",
          projectName: h.ProjectName || "",
          baseAmount: num(h.Subtotal),
          vatAmount: num(h.VATAmount),
          goodsBase,
          serviceBase,
        });
      }

      rows.sort((a, b) => {
        if (a.docDate !== b.docDate) return a.docDate < b.docDate ? -1 : 1;
        return a.docNumber.localeCompare(b.docNumber);
      });

      const totalBase = rows.reduce((s, r) => s + r.baseAmount, 0);
      const totalVAT = rows.reduce((s, r) => s + r.vatAmount, 0);
      const totalGoodsBase = rows.reduce((s, r) => s + r.goodsBase, 0);
      const totalServiceBase = rows.reduce((s, r) => s + r.serviceBase, 0);
      const customerCount = new Set(
        rows.map((r) => r.customerId).filter(Boolean),
      ).size;

      return {
        stats: {
          totalCount: rows.length,
          totalBase,
          totalVAT,
          customerCount,
          totalGoodsBase,
          totalServiceBase,
        },
        rows,
      };
    }),

  /**
   * VAT 30 — combined Input + Output VAT summary for ภ.พ.30 filing (S25B Phase 2).
   *
   * Combines:
   *   - Input VAT (ภาษีซื้อ)  — from `report.vat` logic (paid tax-invoice payments)
   *   - Output VAT (ภาษีขาย)  — from `report.vatSales` logic (issued tax invoices)
   *   - Net VAT
   *       positive → ต้องเสียเพิ่ม (Pay)
   *       negative → ภาษีคงเหลือยกไป (Carry-forward credit)
   *
   * Read-only aggregation per SYSTEM_REQUIREMENTS principle 3 (no caching).
   *
   * Returns: { input: {totalBase, totalVAT, count}, output: {...}, net: {...} }
   */
  vat30: orgProcedure
    .input(
      z.object({
        from: z.string().min(10),
        to: z.string().min(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sheets = await getSheetsService(ctx.org.orgId);

      const [payments, payees, batch] = await Promise.all([
        sheets.getPayments(),
        sheets.getPayees(),
        sheets.getAllBatch([
          SHEET_TABS.TAX_INVOICES,
          SHEET_TABS.TAX_INVOICE_LINES,
        ]),
      ]);

      const payeeMap = new Map(
        payees.map((p) => [
          p.PayeeID,
          {
            name: p.PayeeName || p.PayeeID,
            taxId: p.TaxID || "",
          },
        ]),
      );

      // ===== INPUT VAT (purchases) =====
      // Mirrors `report.vat` logic — status=paid + DocumentType=tax_invoice + VAT>0
      const inputDateOf = (p: Record<string, string>): string => {
        if (p.ReceiptDate) return p.ReceiptDate;
        if (p.PaymentDate) return p.PaymentDate;
        if (p.PaidAt && p.PaidAt.length >= 10) return p.PaidAt.slice(0, 10);
        return "";
      };

      type InputRow = {
        paymentId: string;
        date: string;
        invoiceNumber: string;
        receiptNumber: string;
        payeeId: string;
        payeeName: string;
        taxId: string;
        baseAmount: number;
        vatAmount: number;
      };
      const inputRows: InputRow[] = [];
      for (const p of payments) {
        if (p.Status !== "paid") continue;
        if (p.DocumentType !== "tax_invoice") continue;
        const vat = num(p.VATAmount);
        if (vat <= 0) continue;
        const date = inputDateOf(p);
        if (!date) continue;
        if (date < input.from || date > input.to) continue;
        const info = payeeMap.get(p.PayeeID);
        inputRows.push({
          paymentId: p.PaymentID,
          date,
          invoiceNumber: p.InvoiceNumber || "",
          receiptNumber: p.ReceiptNumber || "",
          payeeId: p.PayeeID,
          payeeName: info?.name || p.PayeeID || "—",
          taxId: info?.taxId || p.VendorTaxIdSnapshot || "",
          baseAmount: num(p.TTLAmount),
          vatAmount: vat,
        });
      }
      inputRows.sort((a, b) =>
        a.date !== b.date ? (a.date < b.date ? -1 : 1) : 0,
      );

      // ===== OUTPUT VAT (sales) =====
      const tiHeaders = batch[SHEET_TABS.TAX_INVOICES] || [];
      type OutputRow = {
        taxInvoiceId: string;
        docNumber: string;
        date: string;
        customerName: string;
        customerTaxId: string;
        baseAmount: number;
        vatAmount: number;
      };
      const outputRows: OutputRow[] = [];
      for (const h of tiHeaders) {
        if (h.Status !== "issued") continue;
        if (!h.DocDate) continue;
        if (h.DocDate < input.from || h.DocDate > input.to) continue;
        outputRows.push({
          taxInvoiceId: h.TaxInvoiceID,
          docNumber: h.DocNumber || "",
          date: h.DocDate,
          customerName: h.CustomerNameSnapshot || h.CustomerID || "—",
          customerTaxId: h.CustomerTaxIdSnapshot || "",
          baseAmount: num(h.Subtotal),
          vatAmount: num(h.VATAmount),
        });
      }
      outputRows.sort((a, b) =>
        a.date !== b.date ? (a.date < b.date ? -1 : 1) : 0,
      );

      // ===== Aggregates =====
      const inputTotalBase = inputRows.reduce((s, r) => s + r.baseAmount, 0);
      const inputTotalVAT = inputRows.reduce((s, r) => s + r.vatAmount, 0);
      const outputTotalBase = outputRows.reduce((s, r) => s + r.baseAmount, 0);
      const outputTotalVAT = outputRows.reduce((s, r) => s + r.vatAmount, 0);
      const netVAT = outputTotalVAT - inputTotalVAT;

      return {
        input: {
          rows: inputRows,
          totalCount: inputRows.length,
          totalBase: inputTotalBase,
          totalVAT: inputTotalVAT,
        },
        output: {
          rows: outputRows,
          totalCount: outputRows.length,
          totalBase: outputTotalBase,
          totalVAT: outputTotalVAT,
        },
        net: {
          // Positive = ต้องเสียเพิ่มภาษีขาย, Negative = ภาษีคงเหลือยกไป
          netVAT,
          inputTotalVAT,
          outputTotalVAT,
          direction: (netVAT > 0
            ? "pay"
            : netVAT < 0
              ? "carry_forward"
              : "balanced") as "pay" | "carry_forward" | "balanced",
        },
      };
    }),
});

export type ReportRouter = typeof reportRouter;
