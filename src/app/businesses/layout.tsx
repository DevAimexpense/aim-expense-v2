"use client";

import { TRPCProvider } from "@/lib/trpc/provider";

export default function BusinessesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TRPCProvider>{children}</TRPCProvider>;
}
