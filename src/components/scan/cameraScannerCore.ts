export type ScannerInstance = {
  stop: () => Promise<void>;
  clear: () => void;
};

export type ScannerSessionToken = {
  readonly id: symbol;
  cancelled: boolean;
};

export const CAMERA_BARCODE_REGEX = /^OP-[0-9]{8}-[0-9]{3}-L[0-9]{3}$/;
export const CAMERA_REGION_ID = "lision-camera-region";

export function normalizeCameraBarcode(value: string): string | null {
  const normalized = value.trim();
  return CAMERA_BARCODE_REGEX.test(normalized) ? normalized : null;
}

export function claimCameraBarcode(
  latch: { current: boolean },
  value: string,
  blocked = false,
): string | null {
  if (latch.current || blocked) return null;
  const barcode = normalizeCameraBarcode(value);
  if (!barcode) return null;
  latch.current = true;
  return barcode;
}

export function calculateCode128Roi(viewWidth: number, viewHeight: number) {
  const maxWidth = Math.min(760, Math.floor(viewWidth * 0.86));
  const maxHeight = Math.min(190, Math.floor(viewHeight * 0.42));
  const boundedWidth = Math.max(240, Math.min(maxWidth, maxHeight * 4));
  const width = Math.floor(boundedWidth / 4) * 4;
  return { width, height: width / 4 };
}

export function createLandscapeScanSnapshot(viewWidth: number, viewHeight: number) {
  if (viewHeight > viewWidth) return null;
  return { roi: calculateCode128Roi(viewWidth, viewHeight) };
}

export function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Permissão de câmera negada. Autorize a câmera no navegador ou volte para a digitação manual.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhuma câmera foi encontrada. Continue pela digitação manual.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "A câmera está ocupada por outro aplicativo. Feche-o e tente novamente.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "A câmera não aceitou a configuração solicitada. Tente novamente com o modo compatível.";
  }
  return "Não foi possível iniciar a câmera. Verifique a permissão e tente novamente.";
}

export function stopMediaStream(stream: Pick<MediaStream, "getTracks"> | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function cleanupScanner(scanner: ScannerInstance | null) {
  if (!scanner) return;
  try {
    await scanner.stop();
  } catch {
    // Already stopped or never fully started.
  } finally {
    try { scanner.clear(); } catch { /* already cleared */ }
  }
}

export function createScannerSessionToken(): ScannerSessionToken {
  return { id: Symbol("camera-scanner-session"), cancelled: false };
}

/** Owns the pending scanner locally so a close during start cannot leak it. */
export async function settleScannerStart(
  session: ScannerSessionToken,
  scanner: ScannerInstance,
  startPromise: Promise<unknown>,
): Promise<boolean> {
  try {
    await startPromise;
  } catch (error) {
    if (!session.cancelled) throw error;
  }
  if (!session.cancelled) return true;
  await cleanupScanner(scanner);
  return false;
}

type BarcodeDetectorApi = {
  getSupportedFormats?: () => Promise<string[]>;
};

export async function supportsNativeCode128(detector: BarcodeDetectorApi | undefined): Promise<boolean> {
  if (typeof detector?.getSupportedFormats !== "function") return false;
  try {
    const formats = await detector.getSupportedFormats();
    return formats.includes("code_128");
  } catch {
    return false;
  }
}
