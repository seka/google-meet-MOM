const RECORDING_MIME_TYPE = "audio/webm;codecs=opus";
const RECORDING_TIMESLICE_MS = 1000;

export type MediaRecorderFactory = (
  stream: MediaStream,
  options: MediaRecorderOptions,
) => MediaRecorder;

export class RecordingSession {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  constructor(
    private readonly createMediaRecorder: MediaRecorderFactory = (stream, options) =>
      new MediaRecorder(stream, options),
  ) {}

  start(stream: MediaStream): void {
    this.audioChunks = [];
    this.mediaRecorder = this.createMediaRecorder(stream, { mimeType: RECORDING_MIME_TYPE });
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.audioChunks.push(event.data);
    };
    this.mediaRecorder.start(RECORDING_TIMESLICE_MS);
  }

  getChunks(): readonly Blob[] {
    return this.audioChunks;
  }

  stop(): Promise<Blob | null> {
    if (!this.mediaRecorder) return Promise.resolve(null);

    const mediaRecorder = this.mediaRecorder;
    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        this.mediaRecorder = null;
        resolve(new Blob(this.audioChunks, { type: RECORDING_MIME_TYPE }));
      };
      mediaRecorder.onerror = (event) => {
        this.mediaRecorder = null;
        reject(event.error);
      };
      mediaRecorder.stop();
    });
  }
}
