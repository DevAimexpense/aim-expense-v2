"use client";

import { TRPCProvider } from "@/lib/trpc/provider";

export default function SelectOrgLayout({ children }: { children: React.ReactNode }) {
  return <TRPCProvider>{children}</TRPCProvider>;
}
