import { Suspense } from "react";
import LoginForm from "./login-form";

// Force dynamic rendering — หน้านี้ใช้ useSearchParams (client-side query params)
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
