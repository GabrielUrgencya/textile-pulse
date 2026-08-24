"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { salesAdminConfigurationRequest } from "@/components/sales/admin/SalesAdminConfiguration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SalesAdminDirectoryEntry, SalesAdminPaymentMethods } from "@/lib/sales-admin";

/**
 * Importação de vendas em lote (SALE-2). Reaproveita o contrato canônico
 * POST /api/vendas/admin/sales — envia cada linha sequencialmente com chave
 * idempotente. Sem backend novo: parsing e validação no cliente, servidor
 * calcula peças/comissão/tickets como em qualquer venda.
 */

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const key = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const toNumber = (raw: string) => { const t = (raw ?? "").trim(); if (!t) return 0; const cleaned = t.includes(",") && !t.includes(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/\s/g, ""); const n = Number(cleaned); return Number.isFinite(n) ? n : NaN; };

const HEADER_ALIASES: Record<string, string> = {
  consultora: "consultora", vendedora: "consultora", consultor: "consultora",
  pv: "pv", pv_number: "pv", numero: "pv",
  valor: "valor", valor_venda: "valor",
  frete: "frete", desconto: "desconto",
  metodo: "metodo", forma_pagamento: "metodo", pagamento: "metodo",
  parcelas: "parcelas", parcela: "parcelas",
  conjuntos: "conjuntos", conjunto: "conjuntos",
  pecas_avulsas: "pecas_avulsas", pecas: "pecas_avulsas", avulsas: "pecas_avulsas",
  nota: "nota", nota_fiscal: "nota", nf: "nota",
  status: "status", estado: "status",
  data: "data", data_hora: "data", vendido_em: "data",
};

const TEMPLATE = "consultora,pv,valor,frete,desconto,metodo,parcelas,conjuntos,pecas_avulsas,nota,status,data\nCostureira Ana,PV-1001,1500,50,100,PIX,1,2,0,NF-1,CLOSED,2026-08-10\nTravetador Carlos,PV-1002,800,40,0,Cartão de crédito,3,1,2,,CLOSED,2026-08-12";

type ParsedRow = {
  line: number;
  raw: Record<string, string>;
  consultantProfileId: string;
  consultantLabel: string;
  paymentMethodId: string | null;
  pvNumber: string;
  saleValue: number;
  freightValue: number;
  discountValue: number;
  installments: number;
  setsCount: number;
  loosePiecesCount: number;
  invoiceNumber: string;
  status: "OPEN" | "CLOSED";
  soldAt: string; // ISO
  errors: string[];
};

type RowResult = "pending" | "ok" | "error";

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []; let cur = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
    else if (ch === delimiter && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function SalesImportCsv() {
  const [people, setPeople] = useState<SalesAdminDirectoryEntry[]>([]);
  const [methods, setMethods] = useState<SalesAdminPaymentMethods | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [results, setResults] = useState<Record<number, RowResult>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [directory, paymentMethods] = await Promise.all([
          salesAdminConfigurationRequest<SalesAdminDirectoryEntry[]>("/api/vendas/admin/directory"),
          salesAdminConfigurationRequest<SalesAdminPaymentMethods>("/api/vendas/admin/payment-methods"),
        ]);
        setPeople(directory); setMethods(paymentMethods); setReady(true);
      } catch (cause) { setLoadError(cause instanceof Error ? cause.message : "Não foi possível carregar equipe e métodos."); }
    })();
  }, []);

  const consultants = useMemo(() => people.filter((p) => p.salesRole === "CONSULTANT" && p.membershipIsActive), [people]);
  const consultantByName = useMemo(() => { const m = new Map<string, SalesAdminDirectoryEntry>(); for (const p of consultants) if (p.fullName) m.set(norm(p.fullName), p); return m; }, [consultants]);
  const methodByName = useMemo(() => { const m = new Map<string, string>(); for (const method of methods?.methods ?? []) if (method.isActive) m.set(norm(method.name), method.id); return m; }, [methods]);

  const parse = useCallback(() => {
    setResults({}); setDone(false);
    const lines = text.split(/\r?\n/).map((l) => l).filter((l, i) => i === 0 || l.trim().length > 0);
    if (lines.length < 2) { setRows([]); return; }
    const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
    const headerCells = splitLine(lines[0], delimiter).map((h) => HEADER_ALIASES[norm(h).replace(/\s+/g, "_")] ?? norm(h).replace(/\s+/g, "_"));
    const parsed: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitLine(lines[i], delimiter);
      const raw: Record<string, string> = {};
      headerCells.forEach((h, idx) => { raw[h] = (cells[idx] ?? "").replace(/^"|"$/g, ""); });
      const errors: string[] = [];
      const consultant = consultantByName.get(norm(raw.consultora ?? ""));
      if (!raw.consultora) errors.push("consultora ausente"); else if (!consultant) errors.push(`consultora "${raw.consultora}" não encontrada/ativa`);
      const pvNumber = (raw.pv ?? "").trim();
      if (!pvNumber) errors.push("PV ausente");
      const saleValue = toNumber(raw.valor ?? "");
      if (Number.isNaN(saleValue) || saleValue < 0) errors.push("valor inválido");
      const freightValue = toNumber(raw.frete ?? "0"); if (Number.isNaN(freightValue) || freightValue < 0) errors.push("frete inválido");
      const discountValue = toNumber(raw.desconto ?? "0"); if (Number.isNaN(discountValue) || discountValue < 0) errors.push("desconto inválido");
      if (!Number.isNaN(saleValue) && !Number.isNaN(discountValue) && discountValue > saleValue) errors.push("desconto maior que o valor");
      let paymentMethodId: string | null = null;
      if (raw.metodo && raw.metodo.trim()) { const found = methodByName.get(norm(raw.metodo)); if (!found) errors.push(`método "${raw.metodo}" não encontrado`); else paymentMethodId = found; }
      const installments = Math.round(toNumber(raw.parcelas ?? "1") || 1); if (installments < 1) errors.push("parcelas < 1");
      const setsCount = Math.round(toNumber(raw.conjuntos ?? "0") || 0);
      const loosePiecesCount = Math.round(toNumber(raw.pecas_avulsas ?? "0") || 0);
      const status: "OPEN" | "CLOSED" = norm(raw.status ?? "closed").startsWith("open") || norm(raw.status ?? "").startsWith("pipe") ? "OPEN" : "CLOSED";
      let soldAt = new Date().toISOString();
      const dateRaw = (raw.data ?? "").trim();
      if (dateRaw) { const d = new Date(dateRaw.length <= 10 ? `${dateRaw}T12:00:00` : dateRaw); if (Number.isNaN(d.getTime())) errors.push("data inválida"); else soldAt = d.toISOString(); }
      parsed.push({ line: i + 1, raw, consultantProfileId: consultant?.profileId ?? "", consultantLabel: consultant?.fullName ?? raw.consultora ?? "—", paymentMethodId, pvNumber, saleValue: Number.isNaN(saleValue) ? 0 : saleValue, freightValue: Number.isNaN(freightValue) ? 0 : freightValue, discountValue: Number.isNaN(discountValue) ? 0 : discountValue, installments: installments < 1 ? 1 : installments, setsCount, loosePiecesCount, invoiceNumber: (raw.nota ?? "").trim(), status, soldAt, errors });
    }
    setRows(parsed);
  }, [text, consultantByName, methodByName]);

  const valid = useMemo(() => (rows ?? []).filter((r) => r.errors.length === 0), [rows]);
  const invalidCount = (rows?.length ?? 0) - valid.length;

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setText(await file.text());
  }

  async function runImport() {
    if (!valid.length || running) return;
    setRunning(true); setDone(false);
    const nextResults: Record<number, RowResult> = {};
    for (const row of valid) {
      nextResults[row.line] = "pending"; setResults({ ...nextResults });
      try {
        await salesAdminConfigurationRequest("/api/vendas/admin/sales", { method: "POST", body: JSON.stringify({ saleId: null, consultantProfileId: row.consultantProfileId, pvNumber: row.pvNumber, saleValue: row.saleValue, freightValue: row.freightValue, discountValue: row.discountValue, paymentMethodId: row.paymentMethodId, installments: row.installments, setsCount: row.setsCount, loosePiecesCount: row.loosePiecesCount, invoiceNumber: row.invoiceNumber, status: row.status, soldAt: row.soldAt, expectedRevision: 0, idempotencyKey: key() }) });
        nextResults[row.line] = "ok";
      } catch { nextResults[row.line] = "error"; }
      setResults({ ...nextResults });
    }
    setRunning(false); setDone(true);
  }

  const okCount = Object.values(results).filter((r) => r === "ok").length;
  const failCount = Object.values(results).filter((r) => r === "error").length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="LISION Vendas" title="Importar vendas (CSV)" description="Cole ou envie um CSV. Cada linha vira uma venda pelo contrato canônico — o servidor calcula peças, comissão e tickets." />
      {loadError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div>}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => fileRef.current?.click()}>Enviar arquivo .csv</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setText(TEMPLATE)}>Usar modelo de exemplo</Button>
            <Button asChild variant="ghost" className="min-h-11"><Link href="/vendas/admin/vendas">Voltar à lista</Link></Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csv-text">Conteúdo CSV</Label>
            <Textarea id="csv-text" value={text} onChange={(e) => setText(e.target.value)} rows={8} className="font-mono text-xs" placeholder={TEMPLATE} />
            <p className="text-[11px] text-muted-foreground">Cabeçalho: consultora, pv, valor, frete, desconto, metodo, parcelas, conjuntos, pecas_avulsas, nota, status, data. Delimitador , ou ; · decimal , ou . · data AAAA-MM-DD.</p>
          </div>
          <Button type="button" className="min-h-11" disabled={!ready || !text.trim()} onClick={parse}>Validar linhas</Button>
        </CardContent>
      </Card>

      {rows && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm"><strong>{valid.length}</strong> válida(s)</span>
              {invalidCount > 0 && <span className="text-sm text-destructive">{invalidCount} com erro</span>}
              {done && <span className="text-sm text-muted-foreground">· {okCount} importada(s){failCount ? `, ${failCount} falharam` : ""}</span>}
              <div className="ml-auto flex gap-2">
                <Button type="button" className="min-h-11" disabled={!valid.length || running || done} onClick={() => void runImport()}>{running ? `Importando… ${okCount}/${valid.length}` : `Importar ${valid.length} venda(s)`}</Button>
                {done && <Button asChild variant="outline" className="min-h-11"><Link href="/vendas/admin/vendas">Ver vendas</Link></Button>}
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma linha de dados encontrada. Verifique o cabeçalho e ao menos uma linha.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left"><th className="p-2">#</th><th className="p-2">Consultora</th><th className="p-2">PV</th><th className="p-2">Valor</th><th className="p-2">Status</th><th className="p-2">Situação</th></tr></thead>
                  <tbody>
                    {rows.map((row) => {
                      const result = results[row.line];
                      return (
                        <tr key={row.line} className="border-b">
                          <td className="p-2 tabular-nums text-muted-foreground">{row.line}</td>
                          <td className="p-2">{row.consultantLabel}</td>
                          <td className="p-2">{row.pvNumber || "—"}</td>
                          <td className="p-2 tabular-nums">{money(row.saleValue)}</td>
                          <td className="p-2">{row.status}</td>
                          <td className="p-2">
                            {row.errors.length > 0 ? <StatusBadge status="destructive">{row.errors.join("; ")}</StatusBadge>
                              : result === "ok" ? <StatusBadge status="success">Importada</StatusBadge>
                              : result === "error" ? <StatusBadge status="destructive">Falhou</StatusBadge>
                              : result === "pending" ? <span className="text-muted-foreground">enviando…</span>
                              : <StatusBadge status="neutral">pronta</StatusBadge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
