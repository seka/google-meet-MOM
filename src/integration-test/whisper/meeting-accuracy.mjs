import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { env } from "@huggingface/transformers";
import { calculateCharacterErrorRate } from "../../core/api/whisper/character-error-rate.ts";
import { WhisperClient } from "../../core/api/whisper/client.ts";
import { DEFAULT_SETTINGS } from "../../features/settings/types/settings.ts";
import { buildSpeakerTranscript } from "../../workers/offscreen/transcript.ts";

const [audioPath, referencePath, model = DEFAULT_SETTINGS.whisperModel] = process.argv.slice(2);
assert.ok(
  audioPath && referencePath,
  "Usage: node src/integration-test/whisper/meeting-accuracy.mjs <16kHz-mono.f32le> <reference.txt> [model]",
);

const [audioBytes, reference] = await Promise.all([
  readFile(audioPath),
  readFile(referencePath, "utf8"),
]);
assert.ok(audioBytes.length > 0 && audioBytes.length % 4 === 0, "Expected nonempty f32le audio");

const audio = new Float32Array(audioBytes.length / 4);
for (let index = 0; index < audio.length; index += 1) {
  audio[index] = audioBytes.readFloatLE(index * 4);
}

if (process.env.WHISPER_EVAL_CACHE_DIR) {
  env.cacheDir = resolve(process.env.WHISPER_EVAL_CACHE_DIR);
}
const client = new WhisperClient({
  wasmPaths: pathToFileURL(`${resolve("public/vendor/transformers")}/`).href,
  localModelPath: pathToFileURL(`${resolve("public/models")}/`).href,
});

// 録音停止後と同じタイムスタンプ付きの推論を使い、話者名を除いた表示テキストを採点する。
const start = performance.now();
const result = await client.transcribe(audio, { model, language: "ja", returnTimestamps: true });
const transcript =
  result.chunks.length > 0 ? buildSpeakerTranscript(result.chunks, [], 0) : result.text;
const score = calculateCharacterErrorRate(reference, transcript);
assert.ok(score.rate !== null, "Reference transcript has no scorable characters");

console.log(
  JSON.stringify({
    model,
    audioSeconds: audio.length / 16000,
    elapsedSeconds: (performance.now() - start) / 1000,
    ...score,
    meetsTarget: score.rate <= 0.2,
  }),
);
