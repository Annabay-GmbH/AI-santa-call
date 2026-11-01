// Convert an audio waveform into a gentle mouth opening in the range 0–1.
export function speechLevel(samples) {
  if (!samples?.length) return 0;
  let power = 0;
  for (const sample of samples) { const value = (sample - 128) / 128; power += value * value; }
  const rms = Math.sqrt(power / samples.length);
  return Math.min(1, Math.max(0, (rms - 0.012) * 10));
}

export function smoothSpeechLevel(current, target) {
  return current + (target - current) * (target > current ? 0.55 : 0.25);
}
