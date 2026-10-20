import { Landing } from "@/components/site/landing";
import { pageMeta } from "@/lib/site-lang";

export const dynamic = "force-static";
export const metadata = pageMeta("en", "/", {
  title: "Aim Expense — Thai SME accounting and tax, done inside LINE",
  description:
    "Log expenses by snapping receipts in LINE chat; issue quotations, billing notes, receipts, tax invoices and withholding certificates on the Revenue Department's form. All data stays in your own Google Sheet.",
});

export default function Page() {
  return <Landing lang="en" />;
}
