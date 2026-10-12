import { describe, expect, it } from "vitest";
import { ttsPcm } from "./wav";

function wav(pcm: Buffer, extraChunk = false): Buffer {
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0);
  fmt.writeUInt32LE(16, 4);
  const list = Buffer.concat([Buffer.from("LIST"), Buffer.from([4, 0, 0, 0]), Buffer.from("INFO")]);
  const data = Buffer.alloc(8);
  data.write("data", 0);
  data.writeUInt32LE(pcm.length, 4);
  const body = Buffer.concat([Buffer.from("WAVE"), fmt, ...(extraChunk ? [list] : []), data, pcm]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0);
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

describe("ttsPcm", () => {
  const pcm = Buffer.from([1, 0, 2, 0, 0xff, 0x7f]);

  it("headerless PCM is returned as is", () => {
    expect(Array.from(ttsPcm(pcm))).toEqual([1, 2, 32767]);
  });

  it("a WAV header is stripped, so its 44 bytes do not become a click", () => {
    expect(Array.from(ttsPcm(wav(pcm)))).toEqual([1, 2, 32767]);
  });

  it("finds the data chunk after other chunks", () => {
    expect(Array.from(ttsPcm(wav(pcm, true)))).toEqual([1, 2, 32767]);
  });
});
