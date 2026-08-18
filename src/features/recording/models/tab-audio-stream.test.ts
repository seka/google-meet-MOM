import { describe, expect, it, vi } from "vite-plus/test";
import { getTabAudioStream } from "./tab-audio-stream";

describe("getTabAudioStream", () => {
  it("Chromeのdesktop capture制約でタブ音声を取得する", async () => {
    const audioTrack = { readyState: "live" } as MediaStreamTrack;
    const stream = {
      getAudioTracks: vi.fn().mockReturnValue([audioTrack]),
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);

    await expect(getTabAudioStream("stream-123", { getUserMedia })).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: "stream-123",
        },
      },
      video: false,
    });
  });

  it("liveな音声トラックがなければ取得済みトラックを停止する", async () => {
    const stop = vi.fn();
    const stream = {
      getAudioTracks: vi.fn().mockReturnValue([]),
      getTracks: vi.fn().mockReturnValue([{ stop }]),
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);

    await expect(getTabAudioStream("stream-123", { getUserMedia })).rejects.toThrow(
      "選択したタブの音声トラックを取得できませんでした",
    );
    expect(stop).toHaveBeenCalledOnce();
  });
});
