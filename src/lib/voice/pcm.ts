// PCM helpers for Gemini Live: the microphone goes up as 16 kHz mono 16-bit little-endian PCM,
// the AI voice comes back as 24 kHz mono 16-bit PCM. Both travel as base64.

const TARGET_RATE = 16000;

/**
 * Averages each output sample's window of input samples (a box filter), which also removes most of what would
 * alias. Frames of rate/25 samples (40 ms) give whole output counts at 48 and 44.1 kHz.
 */
export function downsampleTo16k(input: Float32Array, inputRate: number): Int16Array {
  if (inputRate < TARGET_RATE) throw new RangeError("Input rate is below 16 kHz.");
  const ratio = inputRate / TARGET_RATE;
  const out = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(input.length, Math.max(from + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j];
    const s = Math.max(-1, Math.min(1, sum / (to - from)));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

export function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  pcm.forEach((s, i) => view.setInt16(i * 2, s, true));
  let bin = "";
  // In slices: String.fromCharCode with too many arguments overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToFloat32(b64: string): Float32Array<ArrayBuffer> {
  const bin = atob(b64);
  const view = new DataView(new ArrayBuffer(bin.length - (bin.length % 2)));
  for (let i = 0; i < view.byteLength; i++) view.setUint8(i, bin.charCodeAt(i));
  const out = new Float32Array(view.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}
