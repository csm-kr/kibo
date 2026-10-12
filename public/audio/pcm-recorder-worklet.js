// Collects microphone samples on the audio thread and posts them to the page in 40 ms frames
// (sampleRate / 25 samples, a whole number of 16 kHz samples at 48 and 44.1 kHz). The page downsamples and sends.
class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate / 25);
    this.frame = new Float32Array(this.size);
    this.n = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.frame[this.n++] = channel[i];
        if (this.n === this.size) {
          this.port.postMessage(this.frame, [this.frame.buffer]);
          this.frame = new Float32Array(this.size);
          this.n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorder);
