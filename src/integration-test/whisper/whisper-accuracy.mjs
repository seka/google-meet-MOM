import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { env } from "@huggingface/transformers";
import { WhisperClient } from "../../core/api/whisper/client.ts";
import { calculateCharacterErrorRate } from "../../core/api/whisper/character-error-rate.ts";

const DATA_DIR = process.env.FLEURS_EVAL_DATA_DIR;
const MODEL = process.env.FLEURS_EVAL_MODEL ?? "onnx-community/whisper-tiny";
const LIMIT = Number.parseInt(process.env.FLEURS_EVAL_LIMIT ?? "25", 10);

if (!DATA_DIR) {
  throw new Error(
    "FLEURS_EVAL_DATA_DIR must point to a directory containing test.tsv and extracted audio files. See src/integration-test/whisper/README.md.",
  );
}
if (!Number.isInteger(LIMIT) || LIMIT < 1) {
  throw new Error("FLEURS_EVAL_LIMIT must be a positive integer.");
}

const datasetDirectory = resolve(DATA_DIR);
const metadataPath = join(datasetDirectory, "test.tsv");
const audioDirectory = join(datasetDirectory, "audio");
const samples = await loadEvaluationSamples(metadataPath, audioDirectory, LIMIT);
env.cacheDir = join(datasetDirectory, "model-cache");
const wasmDirectory = pathToFileURL(`${resolve("public/vendor/transformers")}/`).href;
const localModelDirectory = pathToFileURL(`${resolve("public/models")}/`).href;
const whisperClient = new WhisperClient({
  wasmPaths: wasmDirectory,
  localModelPath: localModelDirectory,
});

let totalEdits = 0;
let totalReferenceCharacters = 0;
const results = [];

process.stdout.write(`Loading ${MODEL}; evaluating ${samples.length} FLEURS samples...\n`);

for (const sample of samples) {
  const audioSamples = decodeFleursWav(await readFile(sample.audioPath), sample.id);
  const transcription = await whisperClient.transcribe(audioSamples, {
    model: MODEL,
    language: "ja",
    returnTimestamps: false,
  });
  const score = calculateCharacterErrorRate(sample.reference, transcription.text);

  totalEdits += score.editDistance;
  totalReferenceCharacters += score.referenceCharacters;
  results.push({
    id: sample.id,
    reference: sample.reference,
    hypothesis: transcription.text,
    editDistance: score.editDistance,
    cer: score.rate,
  });
  process.stdout.write(
    `FLEURS ${sample.id}: CER ${score.rate === null ? "n/a" : (score.rate * 100).toFixed(2) + "%"}\n`,
  );
}

const microCer = totalReferenceCharacters === 0 ? null : totalEdits / totalReferenceCharacters;
process.stdout.write(
  `\nModel: ${MODEL}\nSamples: ${results.length}\nMicro CER: ${microCer === null ? "n/a" : (microCer * 100).toFixed(2) + "%"}\n`,
);
process.stdout.write(
  `Results JSON: ${JSON.stringify({
    dataset: "google/fleurs ja_jp test",
    datasetRevision: "70bb2e84b976b7e960aa89f1c648e09c59f894dd",
    datasetAttribution: "Google FLEURS, CC BY 4.0",
    model: MODEL,
    runtime: "Node.js with the production WhisperClient (q8)",
    samples: results.length,
    normalization: "NFKC, lowercase, ignore whitespace and Unicode punctuation",
    microCer,
    results,
  })}\n`,
);

async function loadEvaluationSamples(metadataPath, audioDirectory, limit) {
  const metadata = await readFile(metadataPath, "utf8");
  const rows = metadata
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));

  assert.ok(rows.length > 0, `No rows found in ${metadataPath}`);
  const hasHeader = rows[0].includes("path") && rows[0].includes("raw_transcription");
  const columns = hasHeader
    ? {
        path: rows[0].indexOf("path"),
        reference: rows[0].indexOf("raw_transcription"),
        id: rows[0].indexOf("id"),
      }
    : { path: 1, reference: 2, id: 0 };
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const filesByName = await findFilesByName(audioDirectory);

  return dataRows.slice(0, limit).map((row, index) => {
    const id = row[columns.id] ?? String(index);
    const relativeAudioPath = row[columns.path];
    const reference = row[columns.reference];
    assert.ok(relativeAudioPath?.endsWith(".wav"), `FLEURS ${id}: expected a WAV path`);
    assert.ok(reference?.trim(), `FLEURS ${id}: reference transcript is empty`);

    const audioPath = filesByName.get(basename(relativeAudioPath));
    assert.ok(
      audioPath,
      `FLEURS ${id}: audio file ${relativeAudioPath} not found under ${audioDirectory}`,
    );
    return { id, reference, audioPath };
  });
}

async function findFilesByName(directory) {
  const filesByName = new Map();
  const pendingDirectories = [directory];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".wav")) {
        assert.ok(!filesByName.has(entry.name), `Duplicate FLEURS audio filename: ${entry.name}`);
        filesByName.set(entry.name, entryPath);
      }
    }
  }

  return filesByName;
}

function decodeFleursWav(buffer, sampleId) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", `FLEURS ${sampleId}: not a RIFF file`);
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE", `FLEURS ${sampleId}: not a WAVE file`);

  let format = null;
  let channelCount = null;
  let sampleRate = null;
  let bitsPerSample = null;
  let dataOffset = null;
  let dataSize = null;

  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkType === "fmt ") {
      format = buffer.readUInt16LE(chunkDataOffset);
      channelCount = buffer.readUInt16LE(chunkDataOffset + 2);
      sampleRate = buffer.readUInt32LE(chunkDataOffset + 4);
      bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);
    } else if (chunkType === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  assert.equal(channelCount, 1, `FLEURS ${sampleId}: expected mono audio`);
  assert.equal(sampleRate, 16000, `FLEURS ${sampleId}: expected 16 kHz audio`);
  assert.ok(dataOffset !== null && dataSize !== null, `FLEURS ${sampleId}: WAV data chunk missing`);

  const sampleCount = dataSize / (bitsPerSample / 8);
  const samples = new Float32Array(sampleCount);

  if (format === 3 && bitsPerSample === 32) {
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      samples[sampleIndex] = buffer.readFloatLE(dataOffset + sampleIndex * 4);
    }
    return samples;
  }

  if (format === 1 && bitsPerSample === 16) {
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      samples[sampleIndex] = buffer.readInt16LE(dataOffset + sampleIndex * 2) / 32768;
    }
    return samples;
  }

  throw new Error(
    `FLEURS ${sampleId}: unsupported WAV format ${format} with ${bitsPerSample} bits per sample`,
  );
}
