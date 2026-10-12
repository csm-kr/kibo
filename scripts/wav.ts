// Gemini TTS audio as 16-bit little-endian samples. Older replies were headerless PCM; gemini-3.8-flash-tts now
// wraps it in a WAV (RIFF) header, which read as samples becomes a click at the start, so the header is skipped.

export function ttsPcm(raw: Buffer): Int16Array {
  let data = raw;
  if (raw.length >= 12 && raw.toString("ascii", 0, 4) === "RIFF" && raw.toString("ascii", 8, 12) === "WAVE") {
    // Chunks: 4-byte id, 4-byte size, payload padded to an even length.
    for (let at = 12; at + 8 <= raw.length; ) {
      const size = raw.readUInt32LE(at + 4);
      if (raw.toString("ascii", at, at + 4) === "data") {
        data = raw.subarray(at + 8, Math.min(raw.length, at + 8 + size));
        break;
      }
      at += 8 + size + (size % 2);
    }
  }
  // Copy, so the samples are aligned whatever the chunk offset.
  const copy = Buffer.from(data.subarray(0, data.length - (data.length % 2)));
  return new Int16Array(copy.buffer, copy.byteOffset, copy.length / 2);
}
