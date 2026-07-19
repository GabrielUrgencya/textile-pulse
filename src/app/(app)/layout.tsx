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
      {/* visibleToasts=4: a rajada máxima da notificação de facção é 3 individuais
          + 1 resumo. Com o padrão (3), o primeiro sumiria antes de ser lido. */}
      <Toaster position="bottom-right" visibleToasts={4} />
    </AppShell>
  );
}