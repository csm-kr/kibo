// WAV I/O, resampling, pink noise and mixing for the voice comparison. Pure JS, no native deps.

/** Parse a 16-bit PCM WAV buffer (any chunk layout). Returns { rate, samples: Float32Array in [-1, 1] }. */
export function readWav(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') throw new Error('not a WAV');
  let off = 12, rate = 0, channels = 1, bits = 16, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('latin1', off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2);
      rate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      // Streaming encoders sometimes write 0xFFFFFFFF or 0 as the data size.
      if (size === 0 || body + size > buf.length) size = buf.length - body;
      data = buf.subarray(body, body + size);
      break;
    }
    off = body + size + (size & 1);
  }
  if (!data || bits !== 16) throw new Error(`unsupported WAV (bits ${bits})`);
  const n = Math.floor(data.length / 2 / channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2 * channels) / 32768;
  return { rate, samples: out };
}

/** Float32 mono -> 16-bit PCM WAV buffer. */
export function writeWav(samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Float32 -> raw 16-bit little-endian PCM (for streaming). */
export function toPcm16(samples) {
  const b = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  return b;
}

/** Windowed-sinc (Blackman) resampler. Low-pass at 0.45 x the lower rate, so 24 kHz -> 16 kHz does not alias. */
export function resample(x, from, to, halfTaps = 32) {
  if (from === to) return Float32Array.from(x);
  const ratio = to / from;
  const cutoff = 0.9 * Math.min(1, ratio) * 0.5; // cycles per input sample
  const n = Math.floor(x.length * ratio);
  const y = new Float32Array(n);
  const width = Math.ceil(halfTaps / Math.min(1, ratio));
  for (let i = 0; i < n; i++) {
    const t = i / ratio;
    const c = Math.floor(t);
    let acc = 0, wsum = 0;
    for (let k = c - width + 1; k <= c + width; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = t - k;
      const arg = 2 * cutoff * d;
      const sinc = arg === 0 ? 1 : Math.sin(Math.PI * arg) / (Math.PI * arg);
      const wpos = (d + width) / (2 * width);
      const w = wpos <= 0 || wpos >= 1 ? 0 : 0.42 - 0.5 * Math.cos(2 * Math.PI * wpos) + 0.08 * Math.cos(4 * Math.PI * wpos);
      const h = 2 * cutoff * sinc * w;
      acc += x[k] * h;
      wsum += h;
    }
    y[i] = wsum ? acc / wsum : 0;
  }
  return y;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pink noise (Paul Kellet's refined filter on white noise), unit-ish RMS before scaling. */
export function pinkNoise(n, seed) {
  const r = rng(seed);
  const y = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    y[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return y;
}

export function power(x, start = 0, end = x.length) {
  let s = 0;
  for (let i = start; i < end; i++) s += x[i] * x[i];
  return s / Math.max(1, end - start);
}

/** Speech region by 20 ms frame energy: first and last frame within 35 dB of the loudest frame. */
export function speechBounds(x, rate) {
  const f = Math.round(rate * 0.02);
  const e = [];
  for (let i = 0; i + f <= x.length; i += f) e.push(power(x, i, i + f));
  const max = Math.max(...e);
  const thr = max * 10 ** (-35 / 10);
  let first = e.findIndex((v) => v > thr);
  let last = e.length - 1;
  while (last > 0 && e[last] <= thr) last--;
  if (first < 0) first = 0;
  return { start: first * f, end: (last + 1) * f };
}
