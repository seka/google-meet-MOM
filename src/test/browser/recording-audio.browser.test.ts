import { expect, it } from "vite-plus/test";
import { RecordingSession } from "@features/recording/models/recording-session";

it("合成音声を実際のMediaRecorderで録音し、復号後にも音が残る", async () => {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const destination = context.createMediaStreamDestination();
  const session = new RecordingSession();
  oscillator.frequency.value = 440;
  oscillator.connect(destination);
  try {
    await context.resume();
    oscillator.start();
    session.start(destination.stream);
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    const blob = await session.stop();
    expect(blob?.size).toBeGreaterThan(0);
    const decoded = await context.decodeAudioData(await blob!.arrayBuffer());
    expect(decoded.duration).toBeGreaterThan(0.1);
    const samples = decoded.getChannelData(0);
    const energy = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
    expect(energy).toBeGreaterThan(0.01);
  } finally {
    oscillator.stop();
    destination.stream.getTracks().forEach((track) => track.stop());
    await context.close();
  }
});
