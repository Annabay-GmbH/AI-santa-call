// Prefer containers accepted by the transcription API. Firefox versions that
// only offer Ogg can use the server's in-memory conversion fallback.
export function createAudioRecorder(stream, Recorder = MediaRecorder) {
  const candidates = ['audio/webm;codecs=opus','audio/webm','audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/ogg;codecs=opus','audio/ogg'];
  if (typeof Recorder.isTypeSupported === 'function') {
    for (const mimeType of candidates) {
      if (!Recorder.isTypeSupported(mimeType)) continue;
      try { return new Recorder(stream, {mimeType}); } catch { /* Try the next supported format. */ }
    }
  }
  return new Recorder(stream);
}
