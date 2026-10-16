/** Short audible feedback for scans: a high tone for found, a low one for a problem. */
let ctx: AudioContext | null = null;

export function beep(kind: 'ok' | 'warn' | 'err' | 'info') {
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = kind === 'ok' ? 880 : kind === 'info' ? 660 : 220;
    gain.gain.value = 0.06;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (kind === 'err' ? 0.25 : 0.09));
  } catch {
    // No sound available; the visual feedback still shows.
  }
}
