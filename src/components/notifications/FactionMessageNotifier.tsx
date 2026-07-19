"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCircle, X } from "lucide-react";
import { useFactionUnread, type UnreadMessage } from "./FactionUnreadProvider";

/**
 * Toast de mensagem de facção (estilo WhatsApp desktop).
 *
 * Não sonda: consome o FactionUnreadProvider, a fonte única que também alimenta o
 * badge do Chat na sidebar. Montado no AppShell → vale em QUALQUER aba do app.
 */

const TOAST_DURATION_MS = 6000;
const PREVIEW_MAX = 80;
/** Intervalo entre toasts do mesmo ciclo — chegam um a um, não como bloco. */
const TOAST_STAGGER_MS = 700;
/** Teto de toasts individuais por ciclo. 3 = o visibleToasts padrão da sonner:
 *  acima disso ela esconderia os primeiros, então escalonar mais seria trabalho
 *  para ninguém ver. O excedente vira um único resumo. */
const MAX_INDIVIDUAL_TOASTS = 3;

/** Texto do preview. Anexo não tem contentText — descreve o tipo. */
function previewOf(m: UnreadMessage): string {
  switch (m.contentType) {
    case "image": return "Enviou uma imagem";
    case "video": return "Enviou um vídeo";
    case "audio": return "Enviou um áudio";
    case "file": return "Enviou um arquivo";
    default: {
      const text = (m.contentText || "").trim();
      if (!text) return "Nova mensagem";
      return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
    }
  }
}

export function FactionMessageNotifier() {
  const { messages, loaded } = useFactionUnread();
  const router = useRouter();

  // Ids já notificados — impede o mesmo toast a cada ciclo de 10s.
  const notified = React.useRef<Set<string>>(new Set());
  // A 1ª resposta é LINHA DE BASE: registra as não lidas que já existiam sem
  // notificar. Sem isto, abrir a aba com não lidas acumuladas dispararia um toast
  // para cada uma. Só avisamos o que chegar daqui pra frente.
  const baselineDone = React.useRef(false);
  // Timers do escalonamento — precisam morrer com o componente.
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  /** Card claro, clicável, com a facção DAQUELA mensagem. */
  const notifyOne = React.useCallback((m: UnreadMessage) => {
    const open = (id: string | number) => {
      toast.dismiss(id);
      router.push(`/chat?faction=${m.factionId}`);
    };
    toast.custom(
      (id) => (
        <div
          role="button"
          tabIndex={0}
          onClick={() => open(id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(id); }
          }}
          className="group flex w-[356px] cursor-pointer items-start gap-3 rounded-xl border border-black/5 bg-white p-4 shadow-xl ring-1 ring-black/5 transition-colors hover:bg-neutral-50"
        >
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
            <MessageCircle className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-neutral-900">
              {m.factionName}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
              {previewOf(m)}
            </span>
          </span>
          <button
            type="button"
            aria-label="Fechar notificação"
            onClick={(e) => { e.stopPropagation(); toast.dismiss(id); }}
            className="-mr-1 -mt-1 rounded-md p-1 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-900 group-hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      ),
      { duration: TOAST_DURATION_MS },
    );
  }, [router]);

  /** Resumo do excedente — sem facção específica, leva à lista de conversas. */
  const notifyOverflow = React.useCallback((n: number) => {
    const open = (id: string | number) => { toast.dismiss(id); router.push("/chat"); };
    toast.custom(
      (id) => (
        <div
          role="button"
          tabIndex={0}
          onClick={() => open(id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(id); }
          }}
          className="flex w-[356px] cursor-pointer items-center gap-3 rounded-xl border border-black/5 bg-white p-4 shadow-xl ring-1 ring-black/5 transition-colors hover:bg-neutral-50"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
            <MessageCircle className="size-[18px]" />
          </span>
          <span className="text-[14px] font-semibold text-neutral-900">
            +{n} {n === 1 ? "nova mensagem" : "novas mensagens"}
          </span>
        </div>
      ),
      { duration: TOAST_DURATION_MS },
    );
  }, [router]);

  // Timers pendentes morrem com o componente: toast agendado disparando depois do
  // unmount é vazamento silencioso.
  React.useEffect(() => {
    const pending = timers;
    return () => {
      for (const t of pending.current) clearTimeout(t);
      pending.current = [];
    };
  }, []);

  React.useEffect(() => {
    if (!loaded) return; // ainda não sabemos nada — não fechar a linha de base vazia

    if (!baselineDone.current) {
      for (const m of messages) notified.current.add(m.id);
      baselineDone.current = true;
      return;
    }

    const fresh = messages.filter((m) => !notified.current.has(m.id));
    if (fresh.length === 0) return;
    // Marca TODAS agora — inclusive as que só entram no resumo. Senão o ciclo
    // seguinte tentaria notificar de novo as que ficaram fora do teto.
    for (const m of fresh) notified.current.add(m.id);

    const individual = fresh.slice(0, MAX_INDIVIDUAL_TOASTS);
    const overflow = fresh.length - individual.length;

    // Escalonado: a 1ª sai na hora, as demais a cada 700ms.
    individual.forEach((m, i) => {
      if (i === 0) { notifyOne(m); return; }
      timers.current.push(setTimeout(() => notifyOne(m), i * TOAST_STAGGER_MS));
    });

    if (overflow > 0) {
      timers.current.push(
        setTimeout(() => notifyOverflow(overflow), individual.length * TOAST_STAGGER_MS),
      );
    }
  }, [messages, loaded, notifyOne, notifyOverflow]);

  return null;
}
