interface ChromeDesktopAudioConstraints extends MediaTrackConstraints {
  mandatory: {
    chromeMediaSource: "desktop";
    chromeMediaSourceId: string;
  };
}

export async function getTabAudioStream(
  streamId: string,
  mediaDevices: Pick<MediaDevices, "getUserMedia"> = navigator.mediaDevices,
): Promise<MediaStream> {
  const audio: ChromeDesktopAudioConstraints = {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: streamId,
    },
  };
  const stream = await mediaDevices.getUserMedia({ audio, video: false });
  const audioTracks = stream.getAudioTracks();

  if (audioTracks.length === 0 || audioTracks.every((track) => track.readyState !== "live")) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("選択したタブの音声トラックを取得できませんでした");
  }

  return stream;
}
