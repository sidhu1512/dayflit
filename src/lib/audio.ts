/** Ambient soundscapes synthesized with Web Audio (no assets). */

export type AmbientKind = "none" | "rain" | "brown" | "pink" | "white" | "cafe" | "wind" | "stream" | "fire";

export const AMBIENT_OPTIONS: { id: AmbientKind; name: string }[] = [
  { id: "none", name: "Off" },
  { id: "rain", name: "Rain" },
  { id: "brown", name: "Brown noise" },
  { id: "pink", name: "Pink noise" },
  { id: "white", name: "White noise" },
  { id: "wind", name: "Wind" },
  { id: "stream", name: "Stream" },
  { id: "fire", name: "Fireplace" },
  { id: "cafe", name: "Cafe murmur" },
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let nodes: AudioNode[] = [];
let current: AmbientKind = "none";
let timer: number | null = null;

function ensure() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }
  return { ctx: ctx!, master: master! };
}

function noiseBuffer(c: AudioContext, kind: "white" | "pink" | "brown", seconds = 4): AudioBuffer {
  const len = c.sampleRate * seconds;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "white") d[i] = w * 0.5;
    else if (kind === "pink") {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

function source(c: AudioContext, buf: AudioBuffer) {
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start();
  return s;
}

function stopNodes() {
  for (const n of nodes) {
    try {
      if ("stop" in n) (n as AudioBufferSourceNode).stop();
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
  nodes = [];
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
}

function build(kind: AmbientKind) {
  const { ctx: c, master: m } = ensure();
  const out = c.createGain();
  out.connect(m);
  nodes.push(out);
  const add = (n: AudioNode) => {
    nodes.push(n);
    return n;
  };
  switch (kind) {
    case "white":
      add(source(c, noiseBuffer(c, "white"))).connect(out);
      out.gain.value = 0.35;
      break;
    case "pink":
      add(source(c, noiseBuffer(c, "pink"))).connect(out);
      out.gain.value = 0.6;
      break;
    case "brown":
      add(source(c, noiseBuffer(c, "brown"))).connect(out);
      out.gain.value = 0.7;
      break;
    case "rain": {
      const s = add(source(c, noiseBuffer(c, "pink")));
      const hp = add(c.createBiquadFilter()) as BiquadFilterNode;
      hp.type = "highpass";
      hp.frequency.value = 900;
      const lp = add(c.createBiquadFilter()) as BiquadFilterNode;
      lp.type = "lowpass";
      lp.frequency.value = 7000;
      s.connect(hp).connect(lp).connect(out);
      // occasional drops
      const drops = add(c.createGain()) as GainNode;
      drops.gain.value = 0;
      const ws = add(source(c, noiseBuffer(c, "white", 1)));
      const bp = add(c.createBiquadFilter()) as BiquadFilterNode;
      bp.type = "bandpass";
      bp.frequency.value = 3000;
      bp.Q.value = 4;
      ws.connect(bp).connect(drops).connect(out);
      timer = window.setInterval(() => {
        const t = c.currentTime;
        drops.gain.cancelScheduledValues(t);
        drops.gain.setValueAtTime(0.25 + Math.random() * 0.3, t);
        drops.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.08);
        bp.frequency.setValueAtTime(2000 + Math.random() * 3000, t);
      }, 90);
      out.gain.value = 0.7;
      break;
    }
    case "wind": {
      const s = add(source(c, noiseBuffer(c, "pink")));
      const lp = add(c.createBiquadFilter()) as BiquadFilterNode;
      lp.type = "lowpass";
      lp.frequency.value = 400;
      lp.Q.value = 0.8;
      s.connect(lp).connect(out);
      const lfo = add(c.createOscillator()) as OscillatorNode;
      lfo.frequency.value = 0.08;
      const lfoGain = add(c.createGain()) as GainNode;
      lfoGain.gain.value = 300;
      lfo.connect(lfoGain).connect(lp.frequency);
      lfo.start();
      const lfo2 = add(c.createOscillator()) as OscillatorNode;
      lfo2.frequency.value = 0.05;
      const g2 = add(c.createGain()) as GainNode;
      g2.gain.value = 0.3;
      lfo2.connect(g2).connect(out.gain);
      lfo2.start();
      out.gain.value = 0.7;
      break;
    }
    case "stream": {
      const s = add(source(c, noiseBuffer(c, "brown")));
      const bp = add(c.createBiquadFilter()) as BiquadFilterNode;
      bp.type = "bandpass";
      bp.frequency.value = 1200;
      bp.Q.value = 0.5;
      s.connect(bp).connect(out);
      const s2 = add(source(c, noiseBuffer(c, "white")));
      const bp2 = add(c.createBiquadFilter()) as BiquadFilterNode;
      bp2.type = "bandpass";
      bp2.frequency.value = 4500;
      bp2.Q.value = 1.2;
      const g = add(c.createGain()) as GainNode;
      g.gain.value = 0.12;
      s2.connect(bp2).connect(g).connect(out);
      const lfo = add(c.createOscillator()) as OscillatorNode;
      lfo.frequency.value = 0.3;
      const lg = add(c.createGain()) as GainNode;
      lg.gain.value = 500;
      lfo.connect(lg).connect(bp.frequency);
      lfo.start();
      out.gain.value = 0.8;
      break;
    }
    case "fire": {
      const s = add(source(c, noiseBuffer(c, "brown")));
      const lp = add(c.createBiquadFilter()) as BiquadFilterNode;
      lp.type = "lowpass";
      lp.frequency.value = 600;
      s.connect(lp).connect(out);
      const crack = add(c.createGain()) as GainNode;
      crack.gain.value = 0;
      const ws = add(source(c, noiseBuffer(c, "white", 1)));
      const hp = add(c.createBiquadFilter()) as BiquadFilterNode;
      hp.type = "highpass";
      hp.frequency.value = 2500;
      ws.connect(hp).connect(crack).connect(out);
      timer = window.setInterval(() => {
        if (Math.random() < 0.35) {
          const t = c.currentTime;
          crack.gain.cancelScheduledValues(t);
          crack.gain.setValueAtTime(0.3 + Math.random() * 0.5, t);
          crack.gain.exponentialRampToValueAtTime(0.001, t + 0.02 + Math.random() * 0.06);
        }
      }, 120);
      out.gain.value = 0.8;
      break;
    }
    case "cafe": {
      // murmur: layered band-passed pink noise with slow amplitude modulation
      for (let i = 0; i < 3; i++) {
        const s = add(source(c, noiseBuffer(c, "pink", 3 + i)));
        const bp = add(c.createBiquadFilter()) as BiquadFilterNode;
        bp.type = "bandpass";
        bp.frequency.value = 300 + i * 250;
        bp.Q.value = 1.5;
        const g = add(c.createGain()) as GainNode;
        g.gain.value = 0.3;
        const lfo = add(c.createOscillator()) as OscillatorNode;
        lfo.frequency.value = 0.1 + i * 0.07;
        const lg = add(c.createGain()) as GainNode;
        lg.gain.value = 0.15;
        lfo.connect(lg).connect(g.gain);
        lfo.start();
        s.connect(bp).connect(g).connect(out);
      }
      // clinks
      const clink = add(c.createGain()) as GainNode;
      clink.gain.value = 0;
      const osc = add(c.createOscillator()) as OscillatorNode;
      osc.type = "sine";
      osc.frequency.value = 2400;
      osc.connect(clink).connect(out);
      osc.start();
      timer = window.setInterval(() => {
        if (Math.random() < 0.12) {
          const t = c.currentTime;
          osc.frequency.setValueAtTime(1800 + Math.random() * 1800, t);
          clink.gain.cancelScheduledValues(t);
          clink.gain.setValueAtTime(0.08, t);
          clink.gain.exponentialRampToValueAtTime(0.0005, t + 0.25);
        }
      }, 400);
      out.gain.value = 0.9;
      break;
    }
    default:
      break;
  }
}

export function setAmbient(kind: AmbientKind, volume: number) {
  const { ctx: c, master: m } = ensure();
  if (c.state === "suspended") void c.resume();
  const t = c.currentTime;
  if (kind !== current) {
    m.gain.cancelScheduledValues(t);
    m.gain.setTargetAtTime(0, t, 0.15);
    const prev = nodes;
    nodes = [];
    window.setTimeout(() => {
      for (const n of prev) {
        try {
          if ("stop" in n) (n as AudioBufferSourceNode).stop();
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    }, 600);
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    current = kind;
    if (kind !== "none") build(kind);
  }
  const target = kind === "none" ? 0 : Math.max(0, Math.min(1, volume));
  m.gain.cancelScheduledValues(t);
  m.gain.setTargetAtTime(target, t, 0.4);
}

export function stopAmbient() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(0, t, 0.3);
  window.setTimeout(stopNodes, 900);
  current = "none";
}

export function ambientCurrent(): AmbientKind {
  return current;
}

/** Short UI click/complete sounds via Web Audio (used in-window). */
export function uiSound(kind: "complete" | "tick" | "pop", volume = 0.4) {
  const { ctx: c } = ensure();
  if (c.state === "suspended") void c.resume();
  const g = c.createGain();
  g.connect(c.destination);
  const t = c.currentTime;
  const o = c.createOscillator();
  o.connect(g);
  if (kind === "complete") {
    o.type = "sine";
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(990, t + 0.12);
    g.gain.setValueAtTime(volume * 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.start(t);
    o.stop(t + 0.4);
  } else if (kind === "pop") {
    o.type = "triangle";
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.08);
    g.gain.setValueAtTime(volume * 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.start(t);
    o.stop(t + 0.15);
  } else {
    o.type = "square";
    o.frequency.value = 1200;
    g.gain.setValueAtTime(volume * 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.start(t);
    o.stop(t + 0.04);
  }
}
