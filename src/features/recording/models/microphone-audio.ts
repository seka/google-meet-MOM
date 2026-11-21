// 保存音声と設定画面の試し録りに同じマイク処理を使い、環境音とスピーカーからの回り込みを抑える。
export const microphoneAudioConstraints: MediaTrackConstraints = {
  noiseSuppression: true,
  echoCancellation: true,
};
