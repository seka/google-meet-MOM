import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RecordingSession, type MediaRecorderFactory } from "./recording-session";

interface FakeMediaRecorder {
  ondataavailable: ((event: BlobEvent) => void) | null;
  onstop: ((event: Event) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function createFakeMediaRecorder(): FakeMediaRecorder {
  return {
    ondataavailable: null,
    onstop: null,
    onerror: null,
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function emitData(recorder: FakeMediaRecorder, data: Blob): void {
  recorder.ondataavailable?.({ data } as BlobEvent);
}

describe("RecordingSession", () => {
  let recorder: FakeMediaRecorder;
  let createMediaRecorder: ReturnType<typeof vi.fn<MediaRecorderFactory>>;
  let session: RecordingSession;
  const stream = {} as MediaStream;

  beforeEach(() => {
    recorder = createFakeMediaRecorder();
    createMediaRecorder = vi.fn<MediaRecorderFactory>(() => recorder as unknown as MediaRecorder);
    session = new RecordingSession(createMediaRecorder);
  });

  it("Opus WebM を1秒間隔で録音する", () => {
    session.start(stream);

    expect(createMediaRecorder).toHaveBeenCalledWith(stream, {
      mimeType: "audio/webm;codecs=opus",
    });
    expect(recorder.start).toHaveBeenCalledWith(1000);
  });

  it("空ではない音声チャンクだけを保持する", () => {
    session.start(stream);
    const chunk = new Blob(["audio"]);

    emitData(recorder, new Blob());
    emitData(recorder, chunk);

    expect(session.getChunks()).toEqual([chunk]);
  });

  it("停止時に蓄積したチャンクを WebM Blob として返す", async () => {
    session.start(stream);
    emitData(recorder, new Blob(["first"]));
    emitData(recorder, new Blob(["second"]));

    const resultPromise = session.stop();
    recorder.onstop?.(new Event("stop"));
    const result = await resultPromise;

    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(result?.type).toBe("audio/webm;codecs=opus");
    await expect(result?.text()).resolves.toBe("firstsecond");
  });

  it("新しい録音を開始すると以前のチャンクを破棄する", () => {
    session.start(stream);
    emitData(recorder, new Blob(["previous"]));

    const nextRecorder = createFakeMediaRecorder();
    createMediaRecorder.mockReturnValueOnce(nextRecorder as unknown as MediaRecorder);
    session.start(stream);
    emitData(nextRecorder, new Blob(["current"]));

    expect(session.getChunks()).toHaveLength(1);
    expect(session.getChunks()[0]?.size).toBe(new Blob(["current"]).size);
  });

  it("録音を開始していない場合は null を返す", async () => {
    await expect(session.stop()).resolves.toBeNull();
  });

  it("MediaRecorder のエラーを呼び出し元へ返す", async () => {
    session.start(stream);
    const resultPromise = session.stop();
    const error = new DOMException("録音に失敗しました");

    recorder.onerror?.({ error } as ErrorEvent);

    await expect(resultPromise).rejects.toBe(error);
  });
});
