// ===========================================
// Aim Expense — Logout
// POST /api/auth/logout → clear session → redirect to login
// ===========================================

import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";

export async function POST() {
  await clearSession();
  return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL || "http://localhost:3000"));
}

export async function GET() {
  await clearSession();
  return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL || "http://localhost:3000"));
}
