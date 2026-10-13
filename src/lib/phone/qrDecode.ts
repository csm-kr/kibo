// Reads a QR code from the camera's current frame, on the phone only: frames are drawn to an in-memory canvas or
// handed to the browser's own detector, and never stored or sent anywhere.

export type QrDecoder = (video: HTMLVideoElement) => Promise<string | null>;

interface BarcodeDetectorClass {
  new (opts: { formats: string[] }): { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
  getSupportedFormats(): Promise<string[]>;
}

/** Large frames are scaled down first: 640px on the long side is plenty for a QR that fills the framing square. */
const MAX_SIDE = 640;

/** The browser's BarcodeDetector when it reads QR codes (Chrome on Android), else jsQR on canvas frames. */
export async function createQrDecoder(): Promise<QrDecoder> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (Detector) {
    try {
      if ((await Detector.getSupportedFormats()).includes("qr_code")) {
        const detector = new Detector({ formats: ["qr_code"] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // Some builds expose the class but cannot run it; fall back to jsQR.
    }
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No canvas");
  return async (video) => {
    const { videoWidth: w, videoHeight: h } = video;
    if (!w || !h) return null;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}
