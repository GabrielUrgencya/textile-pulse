"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Camera, Loader2, AlertTriangle, SwitchCamera } from "lucide-react";

/**
 * Frente 5 — Bipagem por câmera do celular.
 *
 * Este componente NÃO fala com a API. Ele só liga a câmera, decodifica o
 * código de barras Code128 da etiqueta da OP (o MESMO formato que o leitor USB
 * lê) e devolve o texto cru em onDecode(). Quem processa é o handleScan() da
 * página de scan — ou seja, câmera e bip percorrem exatamente o mesmo caminho.
 *
 * html5-qrcode é carregado dinamicamente (só no cliente, só quando abre) para
 * não pesar o bundle nem tocar em navigator/document no SSR.
 */

interface CameraScannerProps {
  open: boolean;
  onClose: () => void;
  /** Chamado a cada leitura válida com o texto do código. */
  onDecode: (text: string) => void;
  /** Quando true, a câmera segue ligada mas ignora leituras (pai processando). */
  paused?: boolean;
}

// id do container onde a lib injeta o <video>
const REGION_ID = "lision-camera-region";

type ScanState = "starting" | "running" | "error";

export function CameraScanner({ open, onClose, onDecode, paused }: CameraScannerProps) {
  const [state, setState] = useState<ScanState>("starting");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [lastCode, setLastCode] = useState<string>("");

  // Instância do Html5Qrcode (tipada como unknown p/ não exigir os tipos no SSR).
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const lastDecodeRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // Guarda o onDecode mais recente sem re-assinar a câmera a cada render.
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const stop = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (!s) return;
    try {
      await s.stop();
      s.clear();
    } catch {
      /* já parado / desmontado — ignora */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function start() {
      // Câmera exige contexto seguro (HTTPS ou localhost). Sem isso, honestidade:
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setState("error");
        setErrorMsg("A câmera exige HTTPS. Abra o app pelo endereço seguro (https://) para usar a leitura por câmera.");
        return;
      }
      try {
        const mod = await import("html5-qrcode");
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod;
        if (cancelled) return;

        const scanner = new Html5Qrcode(REGION_ID, {
          // Só Code128 — é o que a etiqueta da OP usa (bwip-js). Restringir
          // acelera e evita leitura acidental de QR/EAN de outra coisa.
          formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128],
          verbose: false,
        });
        scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void };

        await scanner.start(
          { facingMode: "environment" }, // câmera traseira
          {
            fps: 10,
            // Código de barras 1D é largo e baixo — janela retangular lê melhor.
            qrbox: (vw: number, vh: number) => {
              const width = Math.floor(Math.min(vw, 640) * 0.8);
              const height = Math.floor(Math.min(vh * 0.4, 180));
              return { width, height };
            },
            aspectRatio: 1.7778,
          },
          (decodedText: string) => {
            if (cancelled || pausedRef.current) return;
            const now = Date.now();
            const prev = lastDecodeRef.current;
            // Antirrepique: ignora o mesmo código lido de novo em <2,5s.
            if (decodedText === prev.code && now - prev.at < 2500) return;
            lastDecodeRef.current = { code: decodedText, at: now };
            setLastCode(decodedText);
            onDecodeRef.current(decodedText);
          },
          () => {
            /* frame sem código — silencioso (é o caso comum) */
          },
        );
        if (cancelled) {
          await stop();
          return;
        }
        setState("running");
      } catch (err) {
        if (cancelled) return;
        setState("error");
        const name = (err as { name?: string })?.name || "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setErrorMsg("Permissão de câmera negada. Autorize o acesso à câmera nas configurações do navegador e tente de novo.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setErrorMsg("Nenhuma câmera encontrada neste dispositivo.");
        } else {
          setErrorMsg("Não foi possível iniciar a câmera. Verifique as permissões e se nenhum outro app está usando a câmera.");
        }
      }
    }

    setState("starting");
    setErrorMsg("");
    setLastCode("");
    start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-background border border-border/60 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Camera className="size-4 text-foreground" />
            <span className="text-[14px] font-medium">Ler código com a câmera</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar câmera"
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Área da câmera */}
        <div className="relative aspect-video bg-black">
          {/* A lib injeta o <video> aqui */}
          <div id={REGION_ID} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

          {/* Overlay de mira (só visual) */}
          {state === "running" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[38%] w-[80%] rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}

          {state === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-[13px]">Iniciando câmera…</span>
            </div>
          )}

          {state === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <AlertTriangle className="size-7 text-warning" />
              <p className="text-[13px] text-white/90">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-4 py-3 border-t border-border/50 min-h-[52px] flex items-center justify-between gap-3">
          {state === "running" ? (
            <>
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <SwitchCamera className="size-3.5" />
                {lastCode ? (
                  <span className="font-mono tabular-nums text-foreground truncate max-w-[220px]">{lastCode}</span>
                ) : (
                  <span>Aponte para o código de barras da OP</span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">Fica lendo em sequência</span>
            </>
          ) : state === "error" ? (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-3 h-9 rounded-lg bg-secondary text-[13px] hover:bg-secondary/70 transition-colors"
            >
              Fechar
            </button>
          ) : (
            <span className="text-[12px] text-muted-foreground">Preparando…</span>
          )}
        </div>
      </div>
    </div>
  );
}
