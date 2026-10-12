import { describe, expect, it } from "vitest";
import { base64ToFloat32, downsampleTo16k, int16ToBase64 } from "./pcm";

function sine(rate: number, seconds: number, hz = 440, amp = 0.8): Float32Array {
  const out = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

describe("downsampleTo16k", () => {
  it("turns 40 ms at 48 kHz and at 44.1 kHz into 640 samples", () => {
    expect(downsampleTo16k(sine(48000, 0.04), 48000)).toHaveLength(640);
    expect(downsampleTo16k(sine(44100, 0.04), 44100)).toHaveLength(640);
  });

  it("keeps 16 kHz input as is, only converted to 16-bit", () => {
    const out = downsampleTo16k(new Float32Array([0, 0.5, -0.5, 1, -1]), 16000);
    expect(Array.from(out)).toEqual([0, 16384, -16384, 32767, -32768]);
  });

  it("keeps a 440 Hz sine near its amplitude and inside the 16-bit range", () => {
    const out = downsampleTo16k(sine(48000, 0.1, 440, 0.8), 48000);
    const peak = Math.max(...Array.from(out, Math.abs));
    expect(peak).toBeGreaterThan(0.75 * 32767);
    expect(peak).toBeLessThanOrEqual(0.8 * 32767);
  });

  it("clips input outside -1..1 instead of wrapping around", () => {
    const out = downsampleTo16k(new Float32Array([2, 2, 2, -2, -2, -2]), 48000);
    expect(Array.from(out)).toEqual([32767, -32768]);
  });

  it("refuses a rate below 16 kHz", () => {
    expect(() => downsampleTo16k(new Float32Array(10), 8000)).toThrow(RangeError);
  });
});

describe("base64 round trip", () => {
  it("encodes little-endian 16-bit PCM and decodes it back to -1..1 floats", () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768, 256]);
    const b64 = int16ToBase64(pcm);
    // 0x0001 little-endian is 01 00.
    expect(Buffer.from(b64, "base64").subarray(2, 4)).toEqual(Buffer.from([1, 0]));
    const back = base64ToFloat32(b64);
    expect(back).toHaveLength(6);
    expect(back[3]).toBeCloseTo(32767 / 32768, 6);
    expect(back[4]).toBe(-1);
    expect(back[5]).toBeCloseTo(256 / 32768, 6);
  });

  it("decodes a 24 kHz sine with its length and range intact", () => {
    const pcm = Int16Array.from(sine(24000, 0.05), (s) => Math.round(s * 32767));
    const back = base64ToFloat32(int16ToBase64(pcm));
    expect(back).toHaveLength(1200);
    for (const v of back) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
    expect(Math.max(...back)).toBeCloseTo(0.8, 2);
  });

  it("handles a chunk larger than one String.fromCharCode call", () => {
    const pcm = new Int16Array(100_000).fill(-2);
    expect(base64ToFloat32(int16ToBase64(pcm))).toHaveLength(100_000);
  });
});
