// ===========================================
// Aim Expense — Shared Types
// ===========================================

export * from "./permissions";

// ===== User =====
export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  lineUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== Organization =====
export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  googleSpreadsheetId: string | null;
  googleDriveFolderId: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ===== Org Member =====
export type MemberStatus = "active" | "pending" | "suspended";

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: import("./permissions").OrgRole;
  status: MemberStatus;
  invitedById: string | null;
  joinedAt: Date | null;
  createdAt: Date;
}

// ===== Subscription =====
export type PlanType = "free" | "starter" | "pro" | "enterprise";
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";

export interface Subscription {
  id: string;
  orgId: string;
  plan: PlanType;
  status: SubscriptionStatus;
  maxMembers: number;
  maxEvents: number;
  scanCredits: number;
  creditsUsed: number;
  bonusCredits: number;
  billingPeriodStart: Date | null;
  billingPeriodEnd: Date | null;
}

// ===== Plan Limits =====
export interface PlanLimits {
  maxMembers: number;
  maxEvents: number;
  scanCredits: number;
  price: number; // THB/month
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    maxMembers: 2,
    maxEvents: 3,
    scanCredits: 8,
    price: 0,
  },
  starter: {
    maxMembers: 5,
    maxEvents: 10,
    scanCredits: 50,
    price: 299,
  },
  pro: {
    maxMembers: 20,
    maxEvents: 50,
    scanCredits: 200,
    price: 799,
  },
  enterprise: {
    maxMembers: 999,
    maxEvents: 999,
    scanCredits: 999,
    price: 2499,
  },
};

// ===== Google Sheets — Business Data Types =====
// (ข้อมูลเหล่านี้อยู่ใน Google Sheets ของ user ไม่ได้อยู่ server)

export interface SheetEvent {
  eventId: string;
  eventName: string;
  budget: number;
  startDate: string;
  endDate: string;
  status: "active" | "completed" | "cancelled";
  description: string;
  createdAt: string;
  createdBy: string;
}

export interface SheetPayee {
  payeeId: string;
  payeeName: string;
  taxId: string;
  bankAccount: string;
  bankName: string;
  isVat: boolean;
  defaultWTH: number;
  phone: string;
  email: string;
  address: string;
}

export interface SheetBank {
  bankId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  branch: string;
  isDefault: boolean;
}

export type PaymentStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "cleared";

export interface SheetPayment {
  paymentId: string;
  eventId: string;
  payeeId: string;
  bankId: string;
  description: string;
  costPerUnit: number;
  days: number;
  numberOfPeople: number;
  ttlAmount: number;
  pctWTH: number;
  wthAmount: number;
  vatAmount: number;
  gttlAmount: number;
  status: PaymentStatus;
  paymentDate: string;
  dueDate: string;
  approvedBy: string;
  approvedAt: string;
  receiptUrl: string;
  notes: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface SheetEventAssignment {
  assignmentId: string;
  eventId: string;
  userId: string;
  assignedBy: string;
  assignedAt: string;
}
