"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Loader2, RotateCcw, Smartphone, X } from "lucide-react";
import {
  CAMERA_REGION_ID,
  calculateCode128Roi,
  cameraErrorMessage,
  claimCameraBarcode,
  cleanupScanner,
  createLandscapeScanSnapshot,
  createScannerSessionToken,
  settleScannerStart,
  stopMediaStream,
  supportsNativeCode128,
  type ScannerInstance,
} from "./cameraScannerCore";

interface CameraScannerProps {
  open: boolean;
  onClose: () => void;
  onDecode: (text: string) => void;
  paused?: boolean;
  feedbackSoundEnabled?: boolean;
}

type ScanState = "starting" | "running" | "accepted" | "error";

function stopInjectedTracks() {
  if (typeof document === "undefined") return;
  const region = document.getElementById(CAMERA_REGION_ID);
  for (const video of Array.from(region?.querySelectorAll("video") ?? [])) {
    const stream = video.srcObject as MediaStream | null;
    stopMediaStream(stream);
    video.srcObject = null;
  }
}

function playAcceptedTone() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 1040;
    gain.gain.setValueAtTime(0.18, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.07);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.07);
    oscillator.addEventListener("ended", () => void context.close().catch(() => {}), { once: true });
  } catch {
    // Feedback is progressive enhancement and never blocks the scan.
  }
}

export function CameraScanner({
  open,
  onClose,
  onDecode,
  paused = false,
  feedbackSoundEnabled = true,
}: CameraScannerProps) {
  const [state, setState] = useState<ScanState>("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [portrait, setPortrait] = useState(false);
  const [orientationReady, setOrientationReady] = useState(false);
  const [showSteadyHint, setShowSteadyHint] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [roi, setRoi] = useState(() => calculateCode128Roi(800, 450));
  const scannerRef = useRef<ScannerInstance | null>(null);
  const cleanupPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const acceptedRef = useRef(false);
  const pausedRef = useRef(paused);
  const portraitRef = useRef(false);
  const onDecodeRef = useRef(onDecode);
  const onCloseRef = useRef(onClose);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  pausedRef.current = paused;
  onDecodeRef.current = onDecode;
  onCloseRef.current = onClose;

  const stopImmediately = useCallback(() => {
    stopInjectedTracks();
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return cleanupPromiseRef.current;
    const cleanup = cleanupScanner(scanner);
    cleanupPromiseRef.current = cleanup;
    return cleanup;
  }, []);

  const close = useCallback(() => {
    acceptedRef.current = true;
    void stopImmediately();
    onCloseRef.current();
  }, [stopImmediately]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => closeButtonRef.current?.focus());

    const updateOrientation = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      portraitRef.current = isPortrait;
      setPortrait(isPortrait);
      setOrientationReady(true);
    };
    updateOrientation();
    window.addEventListener("resize", updateOrientation);
    window.addEventListener("orientationchange", updateOrientation);

    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };
    void orientation?.lock?.("landscape").catch(() => {});

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", updateOrientation);
      window.removeEventListener("orientationchange", updateOrientation);
      document.removeEventListener("keydown", onKeyDown);
      try { orientation?.unlock?.(); } catch { /* unsupported */ }
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !orientationReady || portrait || window.innerHeight > window.innerWidth) return;
    const session = createScannerSessionToken();
    acceptedRef.current = false;
    setState("starting");
    setErrorMsg("");
    setShowSteadyHint(false);
    const hintTimer = window.setTimeout(() => setShowSteadyHint(true), 8000);

    const accept = (decodedText: string) => {
      if (session.cancelled) return;
      const barcode = claimCameraBarcode(
        acceptedRef,
        decodedText,
        pausedRef.current || portraitRef.current,
      );
      if (!barcode) return;
      setState("accepted");
      try { navigator.vibrate?.(70); } catch { /* unsupported */ }
      if (feedbackSoundEnabled) playAcceptedTone();
      void stopImmediately();
      onCloseRef.current();
      queueMicrotask(() => onDecodeRef.current(barcode));
    };

    async function start() {
      if (!window.isSecureContext) {
        setState("error");
        setErrorMsg("A câmera exige uma conexão segura (HTTPS). Use a digitação manual neste acesso.");
        return;
      }
      let localScanner: ScannerInstance | null = null;
      try {
        await cleanupPromiseRef.current;
        if (session.cancelled) return;
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (session.cancelled) return;
        const detector = (globalThis as unknown as {
          BarcodeDetector?: { getSupportedFormats?: () => Promise<string[]> };
        }).BarcodeDetector;
        const useNativeBarcodeDetector = await supportsNativeCode128(detector);
        if (session.cancelled) return;
        const scanner = new Html5Qrcode(CAMERA_REGION_ID, {
          formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128],
          experimentalFeatures: { useBarCodeDetectorIfSupported: useNativeBarcodeDetector },
          verbose: false,
        });
        localScanner = scanner as ScannerInstance;
        const snapshot = createLandscapeScanSnapshot(window.innerWidth, window.innerHeight);
        if (!snapshot) {
          session.cancelled = true;
          await cleanupScanner(localScanner);
          return;
        }
        const sessionRoi = snapshot.roi;
        setRoi(sessionRoi);
        const scanConfig = {
          fps: 15,
          qrbox: () => sessionRoi,
          aspectRatio: 16 / 9,
          disableFlip: true,
        };
        const advancedConstraints = {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          advanced: [{ focusMode: "continuous" }, { focusMode: "single-shot" }],
        } as unknown as MediaTrackConstraints;
        const startWithFallback = async () => {
          try {
            await scanner.start(advancedConstraints, scanConfig, accept, () => {});
          } catch (firstError) {
            const errorName = (firstError as { name?: string })?.name || "";
            if (!/Overconstrained|ConstraintNotSatisfied/i.test(errorName)) throw firstError;
            await scanner.start({ facingMode: "environment" }, scanConfig, accept, () => {});
          }
        };
        const ready = await settleScannerStart(session, localScanner, startWithFallback());
        if (!ready) return;
        scannerRef.current = localScanner;
        setState("running");
      } catch (error) {
        if (localScanner) await cleanupScanner(localScanner);
        if (session.cancelled) return;
        setState("error");
        setErrorMsg(cameraErrorMessage(error));
      }
    }

    void start();
    return () => {
      session.cancelled = true;
      acceptedRef.current = true;
      window.clearTimeout(hintTimer);
      void stopImmediately();
    };
  }, [open, orientationReady, portrait, retryKey, feedbackSoundEnabled, stopImmediately]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-scanner-title"
      className="fixed inset-0 z-[100] overflow-hidden bg-black text-white"
      style={{ touchAction: "none" }}
    >
      <div id={CAMERA_REGION_ID} className="absolute inset-0 bg-black [&_canvas]:!hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <Camera aria-hidden="true" className="size-5" />
          <h2 id="camera-scanner-title" className="text-base font-semibold">Ler código da OP</h2>
        </div>
        <button ref={closeButtonRef} type="button" onClick={close} aria-label="Fechar câmera e voltar à digitação" className="flex size-11 items-center justify-center rounded-full bg-black/55 outline-none ring-1 ring-white/35 focus-visible:ring-2 focus-visible:ring-white">
          <X aria-hidden="true" className="size-6" />
        </button>
      </header>

      {!portrait && state !== "error" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div
            data-testid="camera-code128-roi"
            className="relative rounded-xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.62),0_0_28px_rgba(255,255,255,0.22)]"
            style={{ width: roi.width, height: roi.height }}
          >
            <span className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-red-400/85 motion-safe:animate-pulse" />
          </div>
        </div>
      )}

      <div className="absolute inset-x-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex justify-center text-center">
        <div aria-live="polite" className="max-w-2xl rounded-2xl bg-black/70 px-5 py-4 shadow-xl ring-1 ring-white/20 backdrop-blur-md">
          {portrait ? (
            <div className="flex items-center gap-3 text-left">
              <Smartphone aria-hidden="true" className="size-8 shrink-0 rotate-90" />
              <p className="font-medium">Vire o celular na horizontal e alinhe o código de barras na moldura.</p>
            </div>
          ) : state === "starting" ? (
            <div className="flex items-center justify-center gap-2"><Loader2 aria-hidden="true" className="size-5 animate-spin" /><span>Preparando câmera traseira…</span></div>
          ) : state === "accepted" ? (
            <div className="flex items-center justify-center gap-2 text-emerald-300"><CheckCircle2 aria-hidden="true" className="size-5" /><span className="font-semibold">Código reconhecido</span></div>
          ) : (
            <div>
              <p className="font-medium">Alinhe todo o Code 128 da OP dentro da moldura.</p>
              {showSteadyHint && <p className="mt-1 text-sm text-white/75">Mantenha firme, aproxime devagar e evite reflexos sobre a etiqueta.</p>}
            </div>
          )}
        </div>
      </div>

      {state === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-6">
          <div role="alert" className="w-full max-w-lg rounded-2xl bg-zinc-950 p-6 text-center ring-1 ring-white/20">
            <AlertTriangle aria-hidden="true" className="mx-auto mb-3 size-9 text-amber-400" />
            <p className="text-base leading-relaxed">{errorMsg}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 font-semibold text-black"><RotateCcw aria-hidden="true" className="size-4" />Tentar novamente</button>
              <button type="button" onClick={close} className="min-h-11 rounded-xl border border-white/30 px-4 font-semibold">Usar digitação manual</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
