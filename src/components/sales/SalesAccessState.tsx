import { SalesPageState } from "@/components/sales/SalesPageState";

export function SalesAccessState({
  title,
  description,
  kind = "disabled",
  action = { href: "/dashboard", label: "Voltar ao LISION" },
}: {
  title: string;
  description: string;
  kind?: "disabled" | "forbidden" | "unavailable";
  action?: { href: string; label: string };
}) {
  return (
    <main className="flex min-h-dvh items-center px-4">
      <SalesPageState kind={kind} title={title} description={description} action={action} branded />
    </main>
  );
}
