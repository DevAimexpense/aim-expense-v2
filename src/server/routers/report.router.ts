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
      await sheets.ensureAllTabsExist();

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
      await sheets.ensureAllTabsExist();

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
      await sheets.ensureAllTabsExist();

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
      await sheets.ensureAllTabsExist();

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
});

export type ReportRouter = typeof reportRouter;
