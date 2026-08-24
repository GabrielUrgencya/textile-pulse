"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { salesAdminConfigurationRequest } from "@/components/sales/admin/SalesAdminConfiguration";
import { SalesLoading } from "@/components/sales/SalesLoading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SalesAdminDirectoryEntry } from "@/lib/sales-admin";
import type { SalesList, SalesItem } from "@/lib/sales-admin-sales";

const money = (value: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
const allowed = { status: ["", "OPEN", "CLOSED", "CANCELLED"], sort: ["sold_at", "pv_number", "sale_value", "status"], direction: ["asc", "desc"] } as const;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function SalesAdminSalesList() {
  const router = useRouter(); const search = useSearchParams();
  const [data, setData] = useState<SalesList | null>(null); const [people, setPeople] = useState<SalesAdminDirectoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null); const [warning, setWarning] = useState(""); const [loading, setLoading] = useState(true); const [query, setQuery] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(null); const next = new URLSearchParams(); for (const key of ["period", "consultant"] as const) { const value = search.get(key); if (value && /^[0-9a-f-]{36}$/i.test(value)) next.set(key, value); } for (const key of ["status", "sort", "direction"] as const) { const value = search.get(key); if (value && (allowed[key] as readonly string[]).includes(value)) next.set(key, value); } const page = Number(search.get("page") ?? 1); next.set("page", String(Number.isInteger(page) && page > 0 ? page : 1)); if (next.toString() !== search.toString()) { setWarning("Filtros inválidos foram removidos."); router.replace(`?${next}`); } try { setData(await salesAdminConfigurationRequest<SalesList>(`/api/vendas/admin/sales?${next}`)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Vendas indisponíveis."); } finally { setLoading(false); } }, [router, search]);
  useEffect(() => void load(), [load]);
  useEffect(() => { (async () => { try { setPeople(await salesAdminConfigurationRequest<SalesAdminDirectoryEntry[]>("/api/vendas/admin/directory")); } catch { /* filtro por consultora fica indisponível, sem quebrar a lista */ } })(); }, []);
  function change(key: string, value: string) { const next = new URLSearchParams(search); if (value) next.set(key, value); else next.delete(key); next.set("page", "1"); router.push(`?${next}`); }
  function goToPage(page: number) { const next = new URLSearchParams(search); next.set("page", String(page)); router.push(`?${next}`); }

  const consultants = useMemo(() => people.filter((p) => p.salesRole === "CONSULTANT" && p.membershipIsActive), [people]);
  const visible = useMemo(() => { const q = norm(query.trim()); if (!q || !data) return data?.items ?? []; return data.items.filter((it) => norm(it.pv_number).includes(q) || norm(it.consultant_name ?? "").includes(q) || norm(it.invoice_number ?? "").includes(q)); }, [data, query]);

  return <div className="space-y-6"><PageHeader eyebrow="LISION Vendas" title="Vendas" description="Histórico auditado, paginado e ordenado no servidor." />
    <div className="flex flex-wrap gap-2"><Button asChild className="min-h-11"><Link href="/vendas/admin/vendas/nova">Nova venda</Link></Button><Button asChild variant="outline" className="min-h-11"><Link href="/vendas/admin/vendas/importar">Importar CSV</Link></Button></div>
    {warning && <p role="status" className="rounded-lg border p-3 text-sm">{warning}</p>}{error && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">{error} <Button variant="link" onClick={() => void load()}>Tentar novamente</Button></div>}
    <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Buscar (nesta página)"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="PV, consultora ou nota" className="min-h-11" /></Field>
      <Field label="Consultora"><select className="min-h-11 w-full rounded-md border bg-background px-3" value={search.get("consultant") ?? ""} onChange={(e) => change("consultant", e.target.value)}><option value="">Todas</option>{consultants.map((c) => <option key={c.profileId} value={c.profileId}>{c.fullName ?? "Consultora"}</option>)}</select></Field>
      <Field label="Status"><select className="min-h-11 w-full rounded-md border bg-background px-3" value={search.get("status") ?? ""} onChange={(e) => change("status", e.target.value)}><option value="">Todos</option><option value="OPEN">Pipeline · OPEN</option><option value="CLOSED">Realizado · CLOSED</option><option value="CANCELLED">Canceladas</option></select></Field>
      <Field label="Ordenar por"><select className="min-h-11 w-full rounded-md border bg-background px-3" value={search.get("sort") ?? "sold_at"} onChange={(e) => change("sort", e.target.value)}><option value="sold_at">Data</option><option value="pv_number">PV</option><option value="sale_value">Valor</option><option value="status">Status</option></select></Field>
      <Field label="Direção"><select className="min-h-11 w-full rounded-md border bg-background px-3" value={search.get("direction") ?? "desc"} onChange={(e) => change("direction", e.target.value)}><option value="desc">Mais recentes</option><option value="asc">Mais antigas</option></select></Field>
      <Button variant="outline" className="min-h-11 sm:col-span-2 sm:w-fit lg:col-span-4" onClick={() => { setQuery(""); router.push("/vendas/admin/vendas"); }}>Limpar filtros</Button>
    </CardContent></Card>
    {loading ? <SalesLoading variant="list" /> : data?.items.length ? <><div className="hidden overflow-x-auto rounded-lg border md:block"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">PV</th><th className="p-3">Consultora</th><th className="p-3">Data</th><th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3">Ação</th></tr></thead><tbody>{visible.map((item) => <SaleRow key={item.id} item={item} />)}</tbody></table>{visible.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma venda desta página corresponde à busca.</p>}</div><div className="grid gap-3 md:hidden">{visible.length ? visible.map((item) => <SaleCard key={item.id} item={item} />) : <Card><CardContent className="p-6 text-sm text-muted-foreground">Nenhuma venda desta página corresponde à busca.</CardContent></Card>}</div><nav aria-label={`Página ${data.page}`} className="flex items-center justify-between"><Button variant="outline" disabled={data.page <= 1} onClick={() => goToPage(data.page - 1)}>Anterior</Button><span>Página {data.page} · {data.total} vendas{query ? ` · ${visible.length} nesta busca` : ""}</span><Button variant="outline" disabled={data.page * data.page_size >= Number(data.total)} onClick={() => goToPage(data.page + 1)}>Próxima</Button></nav></> : <Card><CardContent className="p-6">Nenhuma venda corresponde aos filtros.</CardContent></Card>}
  </div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <Label className="grid gap-1">{label}{children}</Label>; }
function SaleRow({ item }: { item: SalesItem }) { return <tr className="border-b"><td className="p-3"><Link className="font-medium underline-offset-4 hover:underline" href={`/vendas/admin/vendas/${item.id}`}>{item.pv_number}</Link></td><td className="p-3">{item.consultant_name ?? "Consultora"}</td><td className="p-3">{new Date(item.sold_at).toLocaleDateString("pt-BR")}</td><td className="p-3">{money(item.sale_value)}</td><td className="p-3"><SaleStatus status={item.status} /></td><td className="p-3"><Button asChild variant="outline"><Link href={`/vendas/admin/vendas/${item.id}`}>Detalhes</Link></Button></td></tr>; }
function SaleCard({ item }: { item: SalesItem }) { return <Card><CardContent className="space-y-3 p-4"><div className="flex justify-between gap-2"><Link className="font-semibold underline" href={`/vendas/admin/vendas/${item.id}`}>PV {item.pv_number}</Link><SaleStatus status={item.status} /></div><p>{item.consultant_name ?? "Consultora"}</p><p>{money(item.sale_value)} · {new Date(item.sold_at).toLocaleDateString("pt-BR")}</p><Button asChild variant="outline" className="min-h-11 w-full"><Link href={`/vendas/admin/vendas/${item.id}`}>Ver detalhes</Link></Button></CardContent></Card>; }
export function SaleStatus({ status }: { status: SalesItem["status"] }) { const labels = { OPEN: "Pipeline · OPEN", CLOSED: "Realizado · CLOSED", CANCELLED: "Cancelada" }; return <StatusBadge status={status === "CLOSED" ? "success" : status === "OPEN" ? "warning" : "neutral"}>{labels[status]}</StatusBadge>; }
