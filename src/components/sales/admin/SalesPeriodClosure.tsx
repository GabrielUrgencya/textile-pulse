"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { salesAdminConfigurationRequest } from "@/components/sales/admin/SalesAdminConfiguration";
import type { SalesAdminConfiguration, SalesPeriodRecord } from "@/lib/sales-admin-configuration";
import type { SalesClosePreview, SalesCloseResult } from "@/lib/sales-period-close";

type Phase = "loading" | "entry" | "previewed" | "submitting" | "recovering" | "committed" | "error";
type ApiError = Error & { code?: string; status?: number };

async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok || !payload?.data) { const error = new Error(payload?.error?.message ?? "Fechamento indisponível.") as ApiError; error.code = payload?.error?.code; error.status = response.status; throw error; }
  return payload.data;
}

function nextDates(period: SalesPeriodRecord) {
  const start = new Date(`${period.startsOn}T00:00:00Z`); const end = new Date(`${period.endsOn}T00:00:00Z`);
  const duration = Math.round((end.getTime() - start.getTime()) / 86400000);
  const nextStart = new Date(end); nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  const nextEnd = new Date(nextStart); nextEnd.setUTCDate(nextEnd.getUTCDate() + duration);
  return { nextStartsOn: nextStart.toISOString().slice(0, 10), nextEndsOn: nextEnd.toISOString().slice(0, 10) };
}

function intentionKeyFrom(periodId: string, startsOn: string, endsOn: string) { return `lision:sales-close:${periodId}:${startsOn}:${endsOn}`; }
function intentionKey(preview: SalesClosePreview) { return intentionKeyFrom(preview.periodId, preview.nextPeriod.startsOn, preview.nextPeriod.endsOn); }
function getStableKey(preview: SalesClosePreview) {
  const storageKey = intentionKey(preview); const existing = sessionStorage.getItem(storageKey); if (existing) return existing;
  const key = `close_${crypto.randomUUID()}`; sessionStorage.setItem(storageKey, key); return key;
}

export function SalesPeriodClosure() {
  const [phase, setPhase] = useState<Phase>("loading"); const [period, setPeriod] = useState<SalesPeriodRecord | null>(null);
  const [preview, setPreview] = useState<SalesClosePreview | null>(null); const [result, setResult] = useState<SalesCloseResult | null>(null);
  const [recovered, setRecovered] = useState(false); const [error, setError] = useState<ApiError | null>(null); const [attemptKey, setAttemptKey] = useState<string | null>(null);
  const submitting = useRef(false); const statusRef = useRef<HTMLDivElement>(null);
  const proposed = useMemo(() => period ? nextDates(period) : null, [period]);

  const loadEntry = useCallback(async () => {
    setPhase("loading"); setError(null); setPreview(null);
    try { const config = await salesAdminConfigurationRequest<SalesAdminConfiguration>("/api/vendas/admin/configuration"); const open = config.periods.find((item) => item.status === "OPEN") ?? null; setPeriod(open); if (open) { const dates = nextDates(open); const persisted = sessionStorage.getItem(intentionKeyFrom(open.id, dates.nextStartsOn, dates.nextEndsOn)); if (persisted) { setAttemptKey(persisted); setPhase("recovering"); return; } } setPhase("entry"); }
    catch (cause) { setError(cause instanceof Error ? cause as ApiError : new Error("Dados indisponíveis.")); setPhase("error"); }
  }, []);
  useEffect(() => void loadEntry(), [loadEntry]);
  useEffect(() => { if (phase === "submitting" || phase === "recovering") requestAnimationFrame(() => statusRef.current?.focus()); }, [phase]);

  async function review() {
    if (!period || !proposed) return; setPhase("loading"); setError(null);
    try { const value = await request<SalesClosePreview>("/api/vendas/admin/period-close/preview", { periodId: period.id, ...proposed }); setPreview(value); setPhase("previewed"); }
    catch (cause) { setError(cause as ApiError); setPhase("error"); }
  }
  async function confirm() {
    if (!preview || submitting.current || !preview.canClose) return; submitting.current = true; const key = getStableKey(preview); setAttemptKey(key); setPhase("submitting"); setError(null);
    try { const value = await request<SalesCloseResult>("/api/vendas/admin/period-close/commit", { periodId: preview.periodId, periodRevision: preview.periodRevision, nextStartsOn: preview.nextPeriod.startsOn, nextEndsOn: preview.nextPeriod.endsOn, idempotencyKey: key }); setResult(value); setRecovered(value.outcome !== "created"); setPhase("committed"); }
    catch (cause) { const apiError = cause as ApiError; setError(apiError); setPhase(apiError.code === "STALE_PREVIEW" || apiError.code === "OVERLAPPING_PERIOD" || apiError.code === "NEXT_PERIOD_NOT_EMPTY" || apiError.code === "PERIOD_ALREADY_CLOSED" || apiError.code === "IDEMPOTENCY_MISMATCH" ? "error" : "recovering"); }
    finally { submitting.current = false; }
  }
  async function recover() {
    if (!attemptKey || submitting.current) return; submitting.current = true; setPhase("recovering"); setError(null);
    try { const value = await request<{ status: "committed" | "failed-before-commit"; result: SalesCloseResult | null }>("/api/vendas/admin/period-close/recovery", { idempotencyKey: attemptKey }); if (value.status === "committed" && value.result) { setResult(value.result); setRecovered(true); setPhase("committed"); } else { await review(); } }
    catch (cause) { setError(cause as ApiError); setPhase("recovering"); }
    finally { submitting.current = false; }
  }

  return <div className="space-y-6"><PageHeader eyebrow="Administração comercial" title="Fechamento do período" description="Feche o ciclo atual, preserve o histórico e inicie o próximo período sem apagar ou zerar registros." />
    {phase === "loading" && <SalesClosureLoading />}
    {phase === "entry" && <SalesClosureEntry period={period} onReview={() => void review()} />}
    {phase === "previewed" && preview && <SalesClosurePreview preview={preview} onConfirm={() => void confirm()} />}
    {phase === "submitting" && <SalesClosureProgress statusRef={statusRef} />}
    {phase === "recovering" && <SalesClosureRecoveryState statusRef={statusRef} error={error} onRecover={() => void recover()} />}
    {phase === "committed" && result && <SalesClosureResult result={result} recovered={recovered} />}
    {phase === "error" && <SalesClosureError error={error} onRefresh={error?.code === "STALE_PREVIEW" ? review : loadEntry} onRecover={attemptKey && !["STALE_PREVIEW", "OVERLAPPING_PERIOD", "IDEMPOTENCY_MISMATCH"].includes(error?.code ?? "") ? recover : null} />}
  </div>;
}

export function SalesClosureEntry({ period, onReview }: { period: SalesPeriodRecord | null; onReview: () => void }) {
  if (!period) return <Alert><AlertTitle>Nenhum período aberto</AlertTitle><AlertDescription>Configure o próximo ciclo em <Link className="underline" href="/vendas/admin/periodos">Períodos</Link>. Nenhum dado foi alterado.</AlertDescription></Alert>;
  return <Card><CardHeader><CardTitle>Período aberto atual</CardTitle></CardHeader><CardContent className="space-y-4"><p><strong>{period.startsOn}</strong> a <strong>{period.endsOn}</strong></p><p className="text-sm text-muted-foreground">O fechamento cria um snapshot auditável. Vendas, metas, comissões e histórico serão preservados.</p><Button className="min-h-11 w-full md:w-auto" onClick={onReview}>Revisar fechamento</Button></CardContent></Card>;
}

export function SalesClosurePreview({ preview, onConfirm }: { preview: SalesClosePreview; onConfirm: () => void }) {
  const summary = preview.summary; const metrics = (summary.realized && typeof summary.realized === "object" ? summary.realized : summary) as Record<string, unknown>;
  const commissionZero = Number(metrics.commission_value ?? 0) === 0;
  return <div className="space-y-5"><section aria-labelledby="impact-title"><Card><CardHeader><CardTitle id="impact-title">Impacto a congelar</CardTitle></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2"><Fact label="Período atual" value={`${preview.period.startsOn} a ${preview.period.endsOn}`} /><Fact label="Total realizado" value={money(metrics.realized_value)} /><Fact label="Vendas" value={String(metrics.sales_count ?? 0)} /><Fact label="Peças" value={String(metrics.pieces_total ?? 0)} /><Fact label="Comissão" value={money(metrics.commission_value)} /></dl>{commissionZero && <p className="mt-4 text-sm text-muted-foreground">Comissão zerada: nenhuma meta com comissão foi atingida neste período.</p>}</CardContent></Card></section>
    <section aria-labelledby="next-title"><Card><CardHeader><CardTitle id="next-title">Próximo período {preview.nextPeriod.mode === "existing" ? "existente" : "proposto"}</CardTitle></CardHeader><CardContent><p>{preview.nextPeriod.startsOn} a {preview.nextPeriod.endsOn}</p><p className="mt-2 text-sm text-muted-foreground">O progresso começa em zero por escopo do novo período. Nenhuma fórmula ou linha histórica será modificada no navegador.</p></CardContent></Card></section>
    {preview.blockers.length > 0 && <Alert variant="destructive"><AlertTitle>Fechamento bloqueado</AlertTitle><AlertDescription>O próximo período está em conflito com o fechamento: ele se sobrepõe a outro intervalo ou já possui atividade comercial. Revise-o em <Link className="underline" href="/vendas/admin/periodos">Períodos</Link>.</AlertDescription></Alert>}
    <SalesClosureConfirmation disabled={!preview.canClose} onConfirm={onConfirm} />
  </div>;
}

export function SalesClosureConfirmation({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  return <AlertDialog><AlertDialogTrigger asChild><Button disabled={disabled} aria-disabled={disabled} className="min-h-11 w-full md:w-auto">Fechar período e iniciar próximo ciclo</Button></AlertDialogTrigger><AlertDialogContent className="max-w-[calc(100%-2rem)]"><AlertDialogHeader><AlertDialogTitle>Confirmar fechamento seguro</AlertDialogTitle><AlertDialogDescription>Esta ação fecha o período atual, congela o snapshot e abre ou seleciona o próximo ciclo. O histórico, as vendas, metas, comissões e a auditoria serão preservados.</AlertDialogDescription></AlertDialogHeader><ul className="list-disc space-y-1 pl-5 text-sm"><li>Não há exclusão ou reset destrutivo.</li><li>O período fechado ficará somente leitura.</li><li>Uma tentativa interrompida será recuperada pela mesma chave.</li></ul><AlertDialogFooter><AlertDialogCancel className="min-h-11 w-full sm:w-auto">Voltar</AlertDialogCancel><AlertDialogAction className="min-h-11 w-full sm:w-auto" onClick={onConfirm}>Fechar período e iniciar próximo ciclo</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

export function SalesClosureProgress({ statusRef }: { statusRef: React.RefObject<HTMLDivElement> }) { return <Card><CardContent ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="p-6"><p className="font-semibold">Fechando período com segurança…</p><p className="mt-2 text-sm text-muted-foreground">O processamento é transacional. Recarregar não exige uma nova tentativa.</p></CardContent></Card>; }

export function SalesClosureRecoveryState({ statusRef, error, onRecover }: { statusRef: React.RefObject<HTMLDivElement>; error: ApiError | null; onRecover: () => void }) { return <Card><CardContent ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="space-y-4 p-6"><p className="font-semibold">Verifique o resultado antes de tentar novamente</p><p className="text-sm text-muted-foreground">A resposta foi interrompida e o commit pode ter concluído. A verificação reutiliza a tentativa original e não duplica o fechamento.</p>{error && <p className="text-sm">{error.message}</p>}<Button className="min-h-11 w-full md:w-auto" onClick={onRecover}>Verificar resultado</Button></CardContent></Card>; }

export function SalesClosureResult({ result, recovered }: { result: SalesCloseResult; recovered: boolean }) { return <div aria-live="polite" className="space-y-5"><Alert><AlertTitle>{recovered ? "Fechamento recuperado" : "Período fechado com segurança"}</AlertTitle><AlertDescription>{recovered ? "Fechamento recuperado após interrupção; nenhuma operação foi duplicada." : "O snapshot foi congelado e o próximo ciclo está aberto."}</AlertDescription></Alert><Card><CardHeader><CardTitle>Resultado canônico</CardTitle></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2"><Fact label="Período fechado" value={result.closedPeriodId} /><Fact label="Identificador do fechamento" value={result.closureId} /><Fact label="Próximo período" value={result.nextPeriodId} /><Fact label="Fechado em" value={result.closedAt || "Confirmado pelo servidor"} /></dl><div className="mt-6 flex flex-col gap-2 md:flex-row"><Button asChild className="min-h-11 w-full md:w-auto"><Link href={`/vendas/admin?period=${result.nextPeriodId}`}>Ir para o novo período</Link></Button><Button asChild variant="outline" className="min-h-11 w-full md:w-auto"><Link href={`/vendas/admin?period=${result.closedPeriodId}`}>Ver histórico fechado</Link></Button></div></CardContent></Card></div>; }

function SalesClosureError({ error, onRefresh, onRecover }: { error: ApiError | null; onRefresh: () => void | Promise<void>; onRecover: (() => void | Promise<void>) | null }) { const overlap = error?.code === "OVERLAPPING_PERIOD"; return <Alert variant="destructive"><AlertTitle>{error?.code === "STALE_PREVIEW" ? "Preview desatualizado" : overlap ? "Período sobreposto" : error?.code === "PERIOD_ALREADY_CLOSED" ? "Período já fechado" : "Não foi possível concluir"}</AlertTitle><AlertDescription><p>{error?.message ?? "O serviço está indisponível."}</p><div className="mt-4 flex flex-col gap-2 md:flex-row">{overlap ? <Button asChild variant="outline"><Link href="/vendas/admin/periodos">Ajustar em Períodos</Link></Button> : <Button variant="outline" onClick={() => void onRefresh()}>{error?.code === "STALE_PREVIEW" ? "Atualizar preview" : "Tentar novamente"}</Button>}{onRecover && <Button onClick={() => void onRecover()}>Verificar resultado</Button>}</div></AlertDescription></Alert>; }
function SalesClosureLoading() { return <Card aria-label="Carregando preview"><CardContent className="space-y-3 p-6"><Skeleton className="h-6 w-48" /><Skeleton className="h-20 w-full" /><Skeleton className="h-11 w-full md:w-64" /></CardContent></Card>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>; }
function money(value: unknown) { const numeric = Number(value ?? 0); return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(numeric) ? numeric : 0); }
