// Lightweight Web Audio sound effects (no assets needed)
let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, dur = 0.12, type: OscillatorType = "sine", vol = 0.18, when = 0) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export const sfx = {
  click: () => tone(660, 0.06, "square", 0.12),
  dice:  () => { tone(440, 0.05, "square", 0.15); tone(620, 0.05, "square", 0.13, 0.06); tone(880, 0.08, "square", 0.12, 0.12); },
  move:  () => tone(520, 0.08, "triangle", 0.16),
  capture: () => { tone(300, 0.1, "sawtooth", 0.2); tone(180, 0.18, "sawtooth", 0.18, 0.08); },
  win: () => { tone(523, 0.12, "triangle", 0.2); tone(659, 0.12, "triangle", 0.2, 0.12); tone(784, 0.18, "triangle", 0.22, 0.24); tone(1046, 0.25, "triangle", 0.22, 0.4); },
  notify: () => { tone(880, 0.1, "sine", 0.18); tone(1175, 0.14, "sine", 0.18, 0.1); },
  applause: () => {
    const a = ac(); if (!a) return;
    const t0 = a.currentTime;
    const dur = 2.2;
    // White-noise buffer => crowd clap shimmer
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / a.sampleRate;
      // envelope: quick attack, slow decay, with claps bursts
      const env = Math.exp(-t * 1.2);
      const burst = (Math.sin(t * 18) > 0.4 ? 1 : 0.35) * (Math.sin(t * 31) > 0.2 ? 1 : 0.6);
      d[i] = (Math.random() * 2 - 1) * env * 0.55 * burst;
    }
    const src = a.createBufferSource(); src.buffer = buf;
    const hp = a.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 800;
    const g = a.createGain(); g.gain.value = 0.35;
    src.connect(hp).connect(g).connect(a.destination);
    src.start(t0);
    // Bravo whistle on top
    tone(1760, 0.18, "triangle", 0.18, 0.1);
    tone(2200, 0.22, "triangle", 0.16, 0.35);
    tone(1320, 0.2,  "triangle", 0.16, 0.7);
  },
};