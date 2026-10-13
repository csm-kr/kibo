import { writeFileSync } from "node:fs";
import QRCode from "qrcode";

// A still video of one QR code, for Chromium's fake camera (--use-file-for-fake-video-capture). Y4M is raw YUV
// 4:2:0: a grey Y plane (black modules on white) and neutral U and V planes. Chromium loops the frames.

const W = 640;
const H = 480;
const FRAMES = 5;

export function writeQrVideo(path: string, text: string): void {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  // Four modules of quiet zone on each side, as large as the frame allows.
  const scale = Math.floor(Math.min(W, H) / (size + 8));
  const left = Math.floor((W - size * scale) / 2);
  const top = Math.floor((H - size * scale) / 2);
  const y = Buffer.alloc(W * H, 255);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!data[r * size + c]) continue;
      for (let dy = 0; dy < scale; dy++) y.fill(0, (top + r * scale + dy) * W + left + c * scale, (top + r * scale + dy) * W + left + (c + 1) * scale);
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(path, Buffer.concat([header, ...Array<Buffer>(FRAMES).fill(frame)]));
}
