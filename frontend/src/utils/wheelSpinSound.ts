/**
 * Механические тики колеса (Web Audio) — имитация звука прокрутки из Rust.
 * Запускается только после жеста пользователя (клик по колесу).
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playMechanicalTick(ctx: AudioContext, volume = 0.35): void {
  const now = ctx.currentTime;
  const duration = 0.045;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'square';
  osc.frequency.setValueAtTime(180 + Math.random() * 90, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + duration);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, now);
  filter.Q.value = 0.8;

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.01);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.4;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.25, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
  noise.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.03);
}

export function resumeWheelAudio(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

/** Тики с замедлением на протяжении анимации вращения. */
export function playWheelSpinSound(durationMs: number): () => void {
  const ctx = getAudioContext();
  void ctx.resume();

  const start = performance.now();
  let cancelled = false;
  let tickCount = 0;

  const scheduleTick = () => {
    if (cancelled) return;
    const elapsed = performance.now() - start;
    if (elapsed >= durationMs) return;

    const progress = elapsed / durationMs;
    const eased = 1 - (1 - progress) ** 2;
    const baseInterval = 55;
    const maxInterval = 420;
    const interval = baseInterval + (maxInterval - baseInterval) * eased;

    playMechanicalTick(ctx, 0.22 + (1 - eased) * 0.18);
    tickCount += 1;

    const nextDelay = interval * (0.85 + Math.random() * 0.3);
    window.setTimeout(scheduleTick, nextDelay);
  };

  playMechanicalTick(ctx, 0.4);
  window.setTimeout(scheduleTick, 40);

  return () => {
    cancelled = true;
  };
}

export function playWheelWinChime(): void {
  const ctx = getAudioContext();
  void ctx.resume();
  const now = ctx.currentTime;

  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = now + i * 0.07;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}
