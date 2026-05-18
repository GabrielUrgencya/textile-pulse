import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LISION Portal — Facção",
  description: "Portal de acompanhamento para facções da Liserie",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {children}
    </div>
  );
}
