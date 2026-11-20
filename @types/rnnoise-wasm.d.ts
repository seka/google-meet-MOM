declare module "@jitsi/rnnoise-wasm/dist/rnnoise-sync.js" {
  export default function createRNNNoiseModule(): {
    HEAPF32: Float32Array;
    _malloc(bytes: number): number;
    _rnnoise_create(model: number): number;
    _rnnoise_process_frame(state: number, output: number, input: number): number;
  };
}
