import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      {children}
      <Toaster position="bottom-right" />
    </AppShell>
  );
}