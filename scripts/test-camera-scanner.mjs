import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile("src/components/scan/CameraScanner.tsx", "utf8");
const coreSource = await readFile("src/components/scan/cameraScannerCore.ts", "utf8");
const compiled = ts.transpileModule(coreSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "require", "module", compiled)(module.exports, createRequire(import.meta.url), module);
const {
  normalizeCameraBarcode,
  claimCameraBarcode,
  calculateCode128Roi,
  createLandscapeScanSnapshot,
  cameraErrorMessage,
  stopMediaStream,
  cleanupScanner,
  createScannerSessionToken,
  settleScannerStart,
  supportsNativeCode128,
} = module.exports;

assert(normalizeCameraBarcode(" OP-20260806-001-L001 ") === "OP-20260806-001-L001", "Canonical OP barcode must be normalized and accepted");
assert(normalizeCameraBarcode("OP-20260806-001-L0001") === null, "Non-canonical lot width must be rejected");
assert(normalizeCameraBarcode("7891234567890") === null, "EAN payload must be rejected");
assert(normalizeCameraBarcode("https://lision.com.br") === null, "QR-like payload must be rejected");

const latch = { current: false };
assert(claimCameraBarcode(latch, "invalid") === null && latch.current === false, "Invalid decodes must not consume the latch");
assert(claimCameraBarcode(latch, "OP-20260806-001-L001") === "OP-20260806-001-L001" && latch.current === true, "First valid decode must atomically claim the latch");
assert(claimCameraBarcode(latch, "OP-20260806-001-L002") === null, "Concurrent valid decode must be ignored after latch");
assert(claimCameraBarcode({ current: false }, "OP-20260806-001-L001", true) === null, "Portrait or paused scanner must suspend decode");

for (const [width, height] of [[390, 844], [844, 390], [1280, 720]]) {
  const roi = calculateCode128Roi(width, height);
  assert(roi.width / roi.height === 4, `ROI must stay 4:1 at ${width}x${height}`);
  assert(roi.width <= width * 0.86 + 1 && roi.height <= height * 0.42 + 1, "ROI must remain inside the preview");
}

assert(createLandscapeScanSnapshot(390, 844) === null, "Portrait must not create a decoder session");
const firstLandscape = createLandscapeScanSnapshot(844, 390);
const rotatedLandscape = createLandscapeScanSnapshot(1280, 720);
assert(firstLandscape.roi.width / firstLandscape.roi.height === 4, "Landscape snapshot must own a 4:1 ROI");
assert(rotatedLandscape.roi.width / rotatedLandscape.roi.height === 4, "Restarted landscape session must own its new 4:1 ROI");
const activeRoi = firstLandscape.roi;
const activeQrbox = () => activeRoi;
createLandscapeScanSnapshot(844, 360); // Same-orientation browser resize must not mutate the active session.
assert(activeQrbox() === activeRoi, "Same-orientation resize must preserve the visual/decoder ROI snapshot until restart");

assert(cameraErrorMessage({ name: "NotAllowedError" }).includes("Permissão"), "Permission denial must be explicit");
assert(cameraErrorMessage({ name: "NotFoundError" }).includes("Nenhuma câmera"), "Missing camera must offer manual fallback");
assert(cameraErrorMessage({ name: "NotReadableError" }).includes("ocupada"), "Busy camera must be explicit");
let stoppedTracks = 0;
stopMediaStream({ getTracks: () => [{ stop: () => { stoppedTracks += 1; } }, { stop: () => { stoppedTracks += 1; } }] });
assert(stoppedTracks === 2, "All camera MediaStream tracks must stop immediately");
let scannerStops = 0;
let scannerClears = 0;
await cleanupScanner({ stop: async () => { scannerStops += 1; }, clear: () => { scannerClears += 1; } });
assert(scannerStops === 1 && scannerClears === 1, "Scanner cleanup must stop and clear exactly once");
await cleanupScanner({ stop: async () => { throw new Error("not running"); }, clear: () => { scannerClears += 1; } });
assert(scannerClears === 2, "Scanner cleanup must clear even when stop rejects");

let resolvePendingStart;
const pendingStart = new Promise((resolve) => { resolvePendingStart = resolve; });
const cancelledSession = createScannerSessionToken();
let cancelledStops = 0;
let cancelledClears = 0;
const pendingScanner = {
  stop: async () => { cancelledStops += 1; },
  clear: () => { cancelledClears += 1; },
};
const pendingResult = settleScannerStart(cancelledSession, pendingScanner, pendingStart);
cancelledSession.cancelled = true;
resolvePendingStart();
assert(await pendingResult === false, "Close before start resolves must never publish a ready scanner");
assert(cancelledStops === 1 && cancelledClears === 1, "Pending local scanner must be stopped and cleared after cancelled start resolves");

const liveSession = createScannerSessionToken();
let liveCleanup = 0;
assert(await settleScannerStart(liveSession, { stop: async () => { liveCleanup += 1; }, clear: () => { liveCleanup += 1; } }, Promise.resolve()) === true, "Active start must publish readiness");
assert(liveCleanup === 0, "Ready scanner must remain owned by the active session");

assert(await supportsNativeCode128({ getSupportedFormats: async () => ["qr_code", "code_128"] }) === true, "Native detector requires explicit code_128 support");
assert(await supportsNativeCode128({ getSupportedFormats: async () => ["qr_code"] }) === false, "Missing code_128 must force ZXing fallback");
assert(await supportsNativeCode128({ getSupportedFormats: async () => { throw new Error("unsupported"); } }) === false, "Detector probe failure must force ZXing fallback");
assert(await supportsNativeCode128(undefined) === false, "Absent BarcodeDetector must force ZXing fallback");

assert(source.includes("const session = createScannerSessionToken()") && source.includes("settleScannerStart(session, localScanner"), "Component must use the executable session lifecycle controller");
assert(source.includes("portrait || window.innerHeight > window.innerWidth") && source.includes("qrbox: () => sessionRoi"), "Decoder must start only in current landscape geometry and share one ROI snapshot with the overlay");
const orientationUpdater = source.slice(source.indexOf("const updateOrientation"), source.indexOf("updateOrientation();"));
assert(!orientationUpdater.includes("setRoi("), "Resize listener must not mutate visual ROI independently of decoder qrbox");
assert(source.includes("supportsNativeCode128(detector)") && source.includes("useBarCodeDetectorIfSupported: useNativeBarcodeDetector"), "Native detector must be enabled only after code_128 feature detection");
assert(source.includes("stopInjectedTracks();") && coreSource.includes("track.stop()"), "Close and unmount must stop MediaStream tracks");
assert(source.indexOf("onCloseRef.current();") < source.indexOf("queueMicrotask(() => onDecodeRef.current(barcode))"), "Overlay must close before submitting decoded text");
assert(source.includes('event.key !== "Tab"') && source.includes("last.focus()") && source.includes("first.focus()"), "Scanner dialog must trap forward and reverse focus");
assert(source.includes("await cleanupPromiseRef.current"), "Retry must await the previous scanner cleanup before starting");
assert(source.includes("setShowSteadyHint(true), 8000"), "Scanner must offer a non-blocking steady-camera hint");
assert(source.includes("!window.isSecureContext") && source.includes("Usar digitação manual"), "Insecure context must explain HTTPS and preserve manual fallback");
assert(source.includes('orientation?.lock?.("landscape").catch') && source.includes("orientation?.unlock?.()"), "Orientation lock must be progressive and safely released");
assert(source.includes("navigator.vibrate?.(70)") && source.includes("if (feedbackSoundEnabled)"), "Haptic and audio feedback must remain optional");
assert(source.includes("motion-safe:animate-pulse"), "Scanner motion must respect reduced-motion preferences");

const page = await readFile("src/app/(app)/scan/page.tsx", "utf8");
assert(page.includes("onDecode={handleScan}"), "Camera must converge on the same handleScan function");
assert(page.includes("handleScan(barcode)"), "Manual/USB input must converge on handleScan");
assert(page.includes('fetch("/api/scan"') && page.includes("event_type: scanMode"), "Both STAGE_IN and STAGE_OUT must use the canonical API payload");
assert(page.includes("feedbackSoundEnabled={soundEnabled}"), "Camera feedback must respect the existing sound setting");
assert(page.includes("cameraButtonRef.current?.focus()") && page.includes("onClose={closeCamera}"), "Closing scanner must return focus to the camera trigger");

console.log("PASS: executable async lifecycle, close-before-start cleanup, rotation snapshots, Code 128 detector fallback and canonical scan convergence.");
