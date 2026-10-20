import { ContactPage, contactMeta } from "@/components/site/contact";

export const dynamic = "force-static";
export const metadata = contactMeta("en");

export default function Page() {
  return <ContactPage lang="en" />;
}
