// ===========================================
// DBD integration — กรมพัฒนาธุรกิจการค้า (Dept. of Business Development)
//
// SCAFFOLD. Real API access is pending DBD approval. This module is the
// support layer so the UI + data flow are ready now; only `callDbdApi()`
// needs a real implementation once the API spec + key are granted.
//
// Behaviour by env:
//   - DBD_API_KEY set        → calls the real DBD API (callDbdApi)
//   - DBD_MOCK=1 (no key)    → returns one sample record for UX testing
//   - neither                → { configured: false } → UI shows "coming soon"
// ===========================================

export interface DbdCompany {
  /** 13-digit juristic person registration / tax ID. */
  taxId: string;
  nameTh: string;
  nameEn?: string;
  branchType: "HQ" | "Branch";
  /** 5-digit RD branch code ("00000" = HQ). */
  branchNumber: string;
  address: string;
  /** Registration status, e.g. "ยังดำเนินกิจการอยู่". */
  status?: string;
  businessType?: string;
}

export interface DbdLookupResult {
  /** `false` until DBD API access is approved + DBD_API_KEY is set. */
  configured: boolean;
  /** `true` when the result comes from the opt-in mock, not the real API. */
  mock?: boolean;
  results: DbdCompany[];
}

export interface DbdLookupParams {
  taxId?: string;
  name?: string;
}

const DBD_API_KEY = process.env.DBD_API_KEY || "";
const DBD_API_BASE = process.env.DBD_API_BASE || "https://openapi.dbd.go.th";
const DBD_MOCK = process.env.DBD_MOCK === "1";

export function isDbdConfigured(): boolean {
  return DBD_API_KEY.length > 0;
}

/**
 * Look up a juristic person at DBD by tax ID or name.
 * Safe to call regardless of configuration — returns `configured: false`
 * (or mock data) until the real API is wired up.
 */
export async function dbdLookup(
  params: DbdLookupParams,
): Promise<DbdLookupResult> {
  if (isDbdConfigured()) {
    return callDbdApi(params);
  }
  if (DBD_MOCK) {
    return { configured: false, mock: true, results: mockResults(params) };
  }
  return { configured: false, results: [] };
}

/**
 * Real DBD API call — IMPLEMENT once DBD approves access.
 *
 * The endpoint/params/response shape below are placeholders. When the spec
 * is confirmed, adjust the request and `normalizeDbdRecord()` accordingly —
 * everything else (router, UI, types) already consumes `DbdLookupResult`.
 */
async function callDbdApi(params: DbdLookupParams): Promise<DbdLookupResult> {
  const url = new URL("/v1/juristic-persons/search", DBD_API_BASE);
  if (params.taxId) url.searchParams.set("juristic_id", params.taxId);
  if (params.name) url.searchParams.set("juristic_name", params.name);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${DBD_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`DBD API ตอบกลับผิดพลาด (${res.status})`);
  }
  const json: unknown = await res.json();
  const rows = Array.isArray((json as { data?: unknown }).data)
    ? ((json as { data: unknown[] }).data)
    : [];
  return {
    configured: true,
    results: rows
      .map(normalizeDbdRecord)
      .filter((r): r is DbdCompany => r !== null),
  };
}

/** Map a raw DBD record to our `DbdCompany`. Adjust to the real schema. */
function normalizeDbdRecord(raw: unknown): DbdCompany | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const taxId = String(r.juristic_id ?? r.taxId ?? "").replace(/\D/g, "");
  if (taxId.length !== 13) return null;
  const branchNumber = String(r.branch_no ?? r.branchNumber ?? "00000").padStart(
    5,
    "0",
  );
  return {
    taxId,
    nameTh: String(r.juristic_name_th ?? r.nameTh ?? ""),
    nameEn: r.juristic_name_en ? String(r.juristic_name_en) : undefined,
    branchType: branchNumber === "00000" ? "HQ" : "Branch",
    branchNumber,
    address: String(r.address ?? ""),
    status: r.juristic_status ? String(r.juristic_status) : undefined,
    businessType: r.objective ? String(r.objective) : undefined,
  };
}

/** Opt-in mock (DBD_MOCK=1) — lets the autofill UX be tested before approval. */
function mockResults(params: DbdLookupParams): DbdCompany[] {
  const taxId = (params.taxId || "0105500000001").replace(/\D/g, "").slice(0, 13);
  const name = params.name || "บริษัท ตัวอย่าง จำกัด";
  return [
    {
      taxId: taxId.padEnd(13, "0"),
      nameTh: name.includes("จำกัด") ? name : `บริษัท ${name} จำกัด`,
      nameEn: "Sample Company Limited",
      branchType: "HQ",
      branchNumber: "00000",
      address:
        "123 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10000",
      status: "ยังดำเนินกิจการอยู่ (ข้อมูลตัวอย่าง)",
      businessType: "ตัวอย่างประเภทธุรกิจ",
    },
  ];
}
