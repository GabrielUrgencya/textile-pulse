import { Suspense } from "react";
import { SalesLoginForm } from "@/components/sales/SalesLoginForm";

export default function SalesLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white" />}>
      <SalesLoginForm />
    </Suspense>
  );
}
