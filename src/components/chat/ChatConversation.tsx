"use client";

import * as React from "react";
import { Check, CheckCheck, Paperclip, Mic, Send, FileText, Download } from "lucide-react";

export interface ChatMessage {
  id: string;
  sender_type: string;
  content_type: string;
  content_text: string | null;
  content_url?: string | null;
  content_meta?: { name?: string; size?: number; mime?: string; duration?: number } | null;
  signed_url?: string;
  read_at: string | null;
  created_at: string;
}

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/webm,audio/mpeg,audio/mp4,audio/ogg,application/pdf,application/zip,.docx,.xlsx,text/plain";

function humanSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Conteúdo da bolha conforme o tipo (Fases B/C: players nativos). */
function MessageBody({ m, onImageClick }: { m: ChatMessage; onImageClick: (url: string) => void }) {
  if (m.content_type === "text" || !m.content_url) {
    return <>{m.content_text}</>;
  }
  if (!m.signed_url) {
    return <span className="italic opacity-70">[mídia indisponível]</span>;
  }
  if (m.content_type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={m.signed_url}
        alt={m.content_meta?.name || "imagem"}
        className="max-h-48 rounded-lg cursor-pointer"
        onClick={() => onImageClick(m.signed_url!)}
      />
    );
  }
  if (m.content_type === "video") {
    return <video controls src={m.signed_url} className="max-h-64 rounded-lg max-w-full" />;
  }
  if (m.content_type === "audio") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <audio controls src={m.signed_url} className="max-w-[240px]" />
        {m.content_meta?.duration ? (
          <span className="text-[10px] opacity-70">{m.content_meta.duration}s</span>
        ) : null}
      </span>
    );
  }
  // file
  return (
    <span className="inline-flex items-center gap-2">
      <FileText className="size-5 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate max-w-[180px] text-sm">{m.content_meta?.name || "arquivo"}</span>
        <span className="block text-[10px] opacity-70">{humanSize(m.content_meta?.size)}</span>
      </span>
      <a
        href={m.signed_url}
        download={m.content_meta?.name}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 grid size-8 place-items-center rounded-full bg-background/20"
        aria-label="Baixar arquivo"
      >
        <Download className="size-4" />
      </a>
    </span>
  );
}

/** Separador de dia (Hoje / Ontem / DD/MM). */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Painel de conversa (lado admin). Fase A: texto + ✓/✓✓.
 * "mySide" define qual sender_type renderiza à direita.
 */
export function ChatConversation({
  title,
  photoUrl,
  messages,
  mySide,
  onSend,
  sending,
  uploadUrl,
  onUploaded,
}: {
  title: string;
  photoUrl?: string | null;
  messages: ChatMessage[];
  mySide: "ADMIN" | "FACTION";
  onSend: (text: string) => void;
  sending: boolean;
  /** Endpoint multipart p/ mídia; se ausente, anexo/mic ficam desabilitados. */
  uploadUrl?: string;
  onUploaded?: (message: ChatMessage) => void;
}) {
  const [text, setText] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [recordSecs, setRecordSecs] = React.useState(0);
  const [modalImage, setModalImage] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const cancelledRef = React.useRef(false);
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecsRef = React.useRef(0);
  const endRef = React.useRef<HTMLDivElement>(null);
  const lastCount = React.useRef(0);

  const uploadFile = React.useCallback(async (file: File, duration?: number) => {
    if (!uploadUrl) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (duration) fd.append("duration", String(duration));
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(json.message || json.error || "Falha no envio");
        return;
      }
      if (json.data && onUploaded) onUploaded(json.data);
    } catch {
      setUploadError("Falha de conexão no envio");
    } finally {
      setUploading(false);
    }
  }, [uploadUrl, onUploaded]);

  // ── Gravação de áudio (press-and-hold; soltar envia, sair cancela) ──────
  const startRecording = React.useCallback(async () => {
    if (!uploadUrl || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      cancelledRef.current = false;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        const secs = recordSecsRef.current;
        setRecording(false);
        setRecordSecs(0);
        if (cancelledRef.current || chunksRef.current.length === 0 || secs < 1) return;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
        uploadFile(file, secs);
      };
      rec.start();
      setRecording(true);
      recordSecsRef.current = 0;
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => {
        recordSecsRef.current += 1;
        setRecordSecs(recordSecsRef.current);
      }, 1000);
    } catch {
      setUploadError("Permita o acesso ao microfone para gravar áudio");
    }
  }, [uploadUrl, recording, uploadFile]);

  const stopRecording = React.useCallback((cancel: boolean) => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    cancelledRef.current = cancel;
    recorderRef.current.stop();
  }, []);

  React.useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const send = () => {
    const t = text.trim();
    if (!t || sending) return;
    onSend(t);
    setText("");
  };

  // Agrupa por dia
  const groups: { day: string; items: ChatMessage[] }[] = [];
  for (const m of messages) {
    const day = dayLabel(m.created_at);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(m);
    else groups.push({ day, items: [m] });
  }

  return (
    <div className="flex h-full flex-1 flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="size-9 rounded-full object-cover" />
        ) : (
          <div className="size-9 rounded-full bg-foreground text-background grid place-items-center text-xs font-semibold">
            {title.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-[11px] text-success">online</p>
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {groups.map((g) => (
          <React.Fragment key={g.day + g.items[0]?.id}>
            <div className="flex justify-center py-1">
              <span className="rounded-full bg-secondary/60 px-3 py-0.5 text-[11px] text-muted-foreground">
                {g.day}
              </span>
            </div>
            {g.items.map((m) => {
              const mine = m.sender_type === mySide;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      mine
                        ? "bg-foreground text-background rounded-br-sm"
                        : "bg-secondary rounded-bl-sm"
                    }`}
                  >
                    <MessageBody m={m} onImageClick={setModalImage} />
                    <span className={`ml-2 inline-flex items-center gap-0.5 align-bottom text-[10px] ${mine ? "opacity-70" : "text-muted-foreground"}`}>
                      {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {mine && (
                        m.read_at
                          ? <CheckCheck className="size-3.5 text-sky-400" aria-label="Lida" />
                          : <Check className="size-3.5" aria-label="Enviada" />
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
        <div ref={endRef} />
      </div>

      {/* Modal de imagem fullscreen */}
      {modalImage && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-4"
          onClick={() => setModalImage(null)}
          role="dialog"
          aria-label="Imagem ampliada"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={modalImage} alt="" className="max-h-[90vh] max-w-[95vw] rounded-lg" />
        </div>
      )}

      {/* Feedback de upload/gravação */}
      {(uploading || uploadError || recording) && (
        <div className="border-t border-border/60 px-3 py-1.5 text-xs">
          {recording && (
            <span className="flex items-center gap-2 text-destructive font-medium">
              <span className="size-2 rounded-full bg-destructive animate-pulse" />
              Gravando… {recordSecs}s — solte para enviar, deslize para fora para cancelar
            </span>
          )}
          {uploading && !recording && <span className="text-muted-foreground">Enviando mídia…</span>}
          {uploadError && !uploading && !recording && (
            <span role="alert" className="text-destructive">{uploadError}</span>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border/60 p-3">
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={ACCEPT}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={!uploadUrl || uploading}
          title={uploadUrl ? "Anexar imagem, vídeo ou arquivo" : "Em breve"}
          onClick={() => fileRef.current?.click()}
          className={`size-9 shrink-0 grid place-items-center rounded-lg transition-colors ${
            uploadUrl ? "text-muted-foreground hover:text-foreground hover:bg-secondary/60" : "text-muted-foreground/40 cursor-not-allowed"
          }`}
          aria-label="Anexar arquivo"
        >
          <Paperclip className="size-4" />
        </button>
        <button
          type="button"
          disabled={!uploadUrl || uploading}
          title={uploadUrl ? "Segure para gravar áudio" : "Em breve"}
          onPointerDown={(e) => { e.preventDefault(); startRecording(); }}
          onPointerUp={() => stopRecording(false)}
          onPointerLeave={() => { if (recording) stopRecording(true); }}
          onPointerCancel={() => { if (recording) stopRecording(true); }}
          className={`size-9 shrink-0 grid place-items-center rounded-lg transition-colors select-none touch-none ${
            recording
              ? "bg-destructive text-destructive-foreground"
              : uploadUrl
                ? "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                : "text-muted-foreground/40 cursor-not-allowed"
          }`}
          aria-label="Gravar áudio (segure)"
        >
          <Mic className="size-4" />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Digite uma mensagem…"
          className="h-10 flex-1 rounded-lg border border-border/60 bg-secondary/30 px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
          aria-label="Mensagem"
          maxLength={2000}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !text.trim()}
          className="size-10 shrink-0 grid place-items-center rounded-lg bg-foreground text-background disabled:opacity-40"
          aria-label="Enviar"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
