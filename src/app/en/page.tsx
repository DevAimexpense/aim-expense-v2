import { Landing } from "@/components/site/landing";
import { pageMeta } from "@/lib/site-lang";

export const dynamic = "force-static";
export const metadata = pageMeta("en", "/", {
  title: "Aim Expense — Thai SME accounting and tax, done inside LINE",
  description:
    "Snap a receipt in LINE and Aim Expense logs the expense. Tax invoices and withholding certificates on Thai Revenue forms. Data stays in your Google Sheet.",
});

export default function Page() {
  return <Landing lang="en" />;
}
