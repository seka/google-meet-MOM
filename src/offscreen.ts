import { env, pipeline } from '@huggingface/transformers'
import { saveRecording, updateRecording } from './db'
import type { ExtensionMessage } from './messages'
import type { ExtensionSettings } from './types'

// SharedArrayBuffer なしで動作させるためシングルスレッドに固定
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1
}

type ASRPipeline = (
  audio: Float32Array,
  options: Record<string, unknown>
) => Promise<{ text: string } | Array<{ text: string }>>

let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []
let startTime = 0
let whisperPipeline: ASRPipeline | null = null
let currentMeetingTitle = 'Google Meet'

async function loadWhisper(model: string): Promise<ASRPipeline> {
  if (!whisperPipeline) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    whisperPipeline = (await (pipeline as any)('automatic-speech-recognition', model, {
      progress_callback: (info: Record<string, unknown>) => {
        if (info['status'] === 'progress') {
          chrome.runtime.sendMessage({
            type: 'TRANSCRIPTION_PROGRESS',
            payload: { progress: (info['progress'] as number) ?? 0 },
          }, () => {})
        }
      },
    })) as ASRPipeline
  }
  return whisperPipeline
}

async function startRecording(streamId: string, meetingTitle: string): Promise<void> {
  currentMeetingTitle = meetingTitle

  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId,
    } as unknown as MediaTrackConstraints,
    video: false,
  })

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

  const audioCtx = new AudioContext()
  const destination = audioCtx.createMediaStreamDestination()
  audioCtx.createMediaStreamSource(tabStream).connect(destination)
  audioCtx.createMediaStreamSource(micStream).connect(destination)

  audioChunks = []
  startTime = Date.now()

  mediaRecorder = new MediaRecorder(destination.stream, {
    mimeType: 'audio/webm;codecs=opus',
  })

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data)
  }

  mediaRecorder.start(1000)
}

async function stopAndTranscribe(settings: ExtensionSettings): Promise<void> {
  if (!mediaRecorder) return

  return new Promise((resolve) => {
    mediaRecorder!.onstop = async () => {
      const duration = (Date.now() - startTime) / 1000
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' })

      const recordingId = await saveRecording({
        date: new Date().toISOString(),
        meetingTitle: currentMeetingTitle,
        duration,
        audioBlob,
        transcript: '',
        minutes: '',
      })

      chrome.runtime.sendMessage({
        type: 'RECORDING_SAVED',
        target: 'background',
        payload: { recordingId },
      }, () => {})

      await transcribe(audioBlob, recordingId, settings)
      resolve()
    }

    mediaRecorder!.stop()
  })
}

async function transcribe(
  audioBlob: Blob,
  recordingId: string,
  settings: ExtensionSettings
): Promise<void> {
  try {
    const arrayBuffer = await audioBlob.arrayBuffer()
    const audioCtx = new AudioContext()
    const decoded = await audioCtx.decodeAudioData(arrayBuffer)

    // 16kHz にリサンプル（Whisper が期待するサンプルレート）
    const targetSampleRate = 16000
    const offlineCtx = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * targetSampleRate),
      targetSampleRate
    )
    const source = offlineCtx.createBufferSource()
    source.buffer = decoded
    source.connect(offlineCtx.destination)
    source.start()
    const resampled = await offlineCtx.startRendering()
    const audioData = resampled.getChannelData(0)

    const asr = await loadWhisper(settings.whisperModel)

    const result = await asr(audioData, {
      language: settings.language === 'ja' ? 'japanese' : 'english',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    })

    const transcript = Array.isArray(result)
      ? result.map((r) => (r as { text: string }).text).join('\n')
      : (result as { text: string }).text

    await updateRecording(recordingId, { transcript })

    chrome.runtime.sendMessage({
      type: 'TRANSCRIPTION_DONE',
      target: 'background',
      payload: { transcript, recordingId },
    }, () => {})
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    chrome.runtime.sendMessage({
      type: 'ERROR',
      payload: { message: `文字起こしエラー: ${msg}` },
    }, () => {})
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.target !== 'offscreen') return false

    ;(async () => {
      switch (message.type) {
        case 'FORWARD_TO_OFFSCREEN': {
          const { streamId, meetingTitle } = message.payload
          await startRecording(streamId, meetingTitle)
          sendResponse({ ok: true })
          break
        }

        case 'OFFSCREEN_STOP': {
          const stored = await chrome.storage.sync.get({
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'llama3.2',
            whisperModel: 'onnx-community/whisper-tiny',
            language: 'ja',
          })
          await stopAndTranscribe(stored as ExtensionSettings)
          sendResponse({ ok: true })
          break
        }
      }
    })()

    return true
  }
)
