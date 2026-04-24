// ===========================================
// Aim Expense — tRPC Client (React)
// ใช้กับ @tanstack/react-query
// ===========================================

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers/_app";

/**
 * tRPC React client — ใช้ใน client components
 * Usage: trpc.event.list.useQuery()
 */
export const trpc = createTRPCReact<AppRouter>();
