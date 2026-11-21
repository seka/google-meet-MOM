import createRNNNoiseModule from "@jitsi/rnnoise-wasm/dist/rnnoise-sync.js";

declare const AudioWorkletProcessor: { new (): object };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

const rnnoise = createRNNNoiseModule();
const frameSize = 480;
const pcmScale = 32768;
const bytesPerSample = Float32Array.BYTES_PER_ELEMENT;

class RNNoiseProcessor extends AudioWorkletProcessor {
  private readonly state = rnnoise._rnnoise_create(0);
  private readonly buffer = rnnoise._malloc(frameSize * bytesPerSample);
  private readonly pcm: Float32Array;
  private readonly output = new Float32Array(frameSize);
  private position = 0;

  constructor() {
    super();
    if (!this.state || !this.buffer) {
      throw new Error("RNNoise の音声処理を初期化できませんでした");
    }
    const offset = this.buffer / bytesPerSample;
    this.pcm = rnnoise.HEAPF32.subarray(offset, offset + frameSize);
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!output) return true;

    // Web Audio のブロックをまたいで48 kHzの480サンプルを集める。
    // 次のフレームを集める間に処理済みのフレームを出力して、再生時間を保つ。
    for (let index = 0; index < output.length; index++) {
      output[index] = this.output[this.position];
      this.pcm[this.position] = (input?.[index] ?? 0) * pcmScale;
      this.position++;
      if (this.position === frameSize) {
        rnnoise._rnnoise_process_frame(this.state, this.buffer, this.buffer);
        for (let sample = 0; sample < frameSize; sample++) {
          this.output[sample] = this.pcm[sample] / pcmScale;
        }
        this.position = 0;
      }
    }
    return true;
  }
}

registerProcessor("rnnoise", RNNoiseProcessor);
