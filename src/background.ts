import { DEFAULT_SETTINGS, type RecordingState } from './types'
import { updateRecording } from './db'
import type { ExtensionMessage } from './messages'

let currentState: RecordingState = 'idle'
let currentRecordingId: string | null = null

// SW が録音中に終了しないよう定期アラームで維持
chrome.alarms.create('keepalive', { periodInMinutes: 0.2 })
chrome.alarms.onAlarm.addListener(() => {})

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  if (contexts.length > 0) return

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Recording Google Meet tab audio and microphone',
  })
}

async function closeOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  if (contexts.length === 0) return
  await chrome.offscreen.closeDocument()
}

function setState(state: RecordingState, extra: Record<string, unknown> = {}): void {
  currentState = state
  chrome.runtime.sendMessage({
    type: 'STATE_CHANGED',
    payload: { state, ...extra },
  }, () => {})
}

async function generateMinutes(transcript: string, recordingId: string): Promise<void> {
  setState('summarizing', { recordingId })
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS)

  try {
    const res = await fetch(`${settings['ollamaUrl']}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings['ollamaModel'],
        stream: false,
        messages: [
          {
            role: 'user',
            content:
              '以下はミーティングの文字起こしです。\n' +
              '日時・参加者・決定事項・アクションアイテムを含む議事録を日本語で Markdown 形式で作成してください。\n\n' +
              '---\n' +
              transcript,
          },
        ],
      }),
    })

    if (!res.ok) throw new Error(`Ollama API: ${res.status} ${res.statusText}`)

    const data = (await res.json()) as { message?: { content: string } }
    const minutes = data.message?.content ?? ''

    await updateRecording(recordingId, { minutes })
    setState('done', { recordingId, minutes })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setState('error', { message: `議事録生成エラー: ${msg}` })
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.target === 'offscreen') return false

    ;(async () => {
      switch (message.type) {
        case 'START_RECORDING': {
          try {
            await ensureOffscreenDocument()
            chrome.runtime.sendMessage({
              type: 'FORWARD_TO_OFFSCREEN',
              target: 'offscreen',
              payload: message.payload,
            }, () => {})
            setState('recording')
            sendResponse({ ok: true })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            setState('error', { message: msg })
            sendResponse({ ok: false, error: msg })
          }
          break
        }

        case 'STOP_RECORDING': {
          chrome.runtime.sendMessage({
            type: 'OFFSCREEN_STOP',
            target: 'offscreen',
          }, () => {})
          setState('transcribing')
          sendResponse({ ok: true })
          break
        }

        case 'GET_STATE': {
          sendResponse({ state: currentState, recordingId: currentRecordingId })
          break
        }

        case 'RECORDING_SAVED': {
          currentRecordingId = message.payload.recordingId
          break
        }

        case 'TRANSCRIPTION_DONE': {
          const { transcript, recordingId } = message.payload
          currentRecordingId = recordingId
          await generateMinutes(transcript, recordingId)
          await closeOffscreenDocument()
          break
        }

        case 'ERROR': {
          setState('error', { message: message.payload.message })
          await closeOffscreenDocument()
          break
        }
      }
    })()

    return true
  }
)
