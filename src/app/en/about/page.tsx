import { AboutPage, aboutMeta } from "@/components/site/about";

export const dynamic = "force-static";
export const metadata = aboutMeta("en");

export default function Page() {
  return <AboutPage lang="en" />;
}
