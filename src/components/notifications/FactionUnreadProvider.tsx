"use client";

import * as React from "react";
import { usePermissions } from "@/hooks/use-permissions";

/**
 * Fonte ÚNICA das mensagens de facção não lidas.
 *
 * Uma sondagem só, dois consumidores: o toast (FactionMessageNotifier) e o badge
 * do Chat (AppSidebar). Se cada um sondasse por conta própria seriam 2 requisições
 * a cada 10s e — pior — duas verdades que divergem (o toast diz 3, o badge diz 2).
 *
 * POLLING e não Realtime: o middleware grava o cookie da sessão como httpOnly
 * (protege o token de XSS), então o navegador não tem o JWT e o Realtime com RLS
 * entrega zero. O isolamento por tenant fica no servidor, em /api/chat/unread.
 */

const POLL_INTERVAL_MS = 10_000;

export interface UnreadMessage {
  id: string;
  factionId: string;
  factionName: string;
  contentType: string;
  contentText: string | null;
}

interface FactionUnreadState {
  /** Contagem EXATA de não lidas (não é messages.length — a lista é capada). */
  count: number;
  /** Até 20 mensagens, o suficiente para o toast. */
  messages: UnreadMessage[];
  /** false até a 1ª resposta chegar. Distingue "ainda não sei" de "sei que é zero" —
   *  sem isto o notificador fecharia a linha de base vazia e depois notificaria
   *  TODAS as não lidas de uma vez. */
  loaded: boolean;
}

const EMPTY: FactionUnreadState = { count: 0, messages: [], loaded: false };

const FactionUnreadContext = React.createContext<FactionUnreadState>(EMPTY);

export function useFactionUnread(): FactionUnreadState {
  return React.useContext(FactionUnreadContext);
}

export function FactionUnreadProvider({ children }: { children: React.ReactNode }) {
  const { can, isLoading } = usePermissions();
  // Quem não vê facções não sonda e não conta.
  const canView = !isLoading && can("factions:view");
  const [state, setState] = React.useState<FactionUnreadState>(EMPTY);

  React.useEffect(() => {
    if (!canView) {
      setState(EMPTY);
      return;
    }
    let alive = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/chat/unread", { credentials: "same-origin" });
        if (!alive || !res.ok) return;
        const json = await res.json();
        setState({
          count: Number(json.count) || 0,
          messages: json.data || [],
          loaded: true,
        });
      } catch {
        // rede instável: silencioso — o próximo ciclo tenta de novo
      }
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [canView]);

  return (
    <FactionUnreadContext.Provider value={state}>{children}</FactionUnreadContext.Provider>
  );
}
