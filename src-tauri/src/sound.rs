//! Synthesized completion sounds played through winmm's PlaySound. No asset files needed;
//! WAV data is generated in memory with the requested gain baked in.

use parking_lot::Mutex;
use std::sync::OnceLock;

static BUFFER: OnceLock<Mutex<Vec<u8>>> = OnceLock::new();

const RATE: u32 = 44_100;

fn envelope(t: f32, attack: f32, decay: f32, total: f32) -> f32 {
    if t < attack {
        t / attack
    } else if t > total {
        0.0
    } else {
        ((total - t) / decay).min(1.0).max(0.0)
    }
}

fn tone(buf: &mut [f32], start: f32, dur: f32, freq: f32, gain: f32, harmonics: &[(f32, f32)]) {
    let s0 = (start * RATE as f32) as usize;
    let n = (dur * RATE as f32) as usize;
    for i in 0..n {
        let idx = s0 + i;
        if idx >= buf.len() {
            break;
        }
        let t = i as f32 / RATE as f32;
        let env = envelope(t, 0.008, dur * 0.7, dur);
        let mut v = (2.0 * std::f32::consts::PI * freq * t).sin();
        for (mult, g) in harmonics {
            v += g * (2.0 * std::f32::consts::PI * freq * mult * t).sin() * (1.0 - t / dur).max(0.0);
        }
        buf[idx] += v * env * gain;
    }
}

fn synth(name: &str) -> Vec<f32> {
    let secs = 1.6f32;
    let mut buf = vec![0f32; (secs * RATE as f32) as usize];
    match name {
        "bell" => {
            tone(&mut buf, 0.0, 1.5, 880.0, 0.5, &[(2.0, 0.35), (3.0, 0.2), (4.2, 0.1)]);
            tone(&mut buf, 0.0, 1.5, 1320.0, 0.2, &[(2.0, 0.2)]);
        }
        "soft" => {
            tone(&mut buf, 0.0, 1.2, 392.0, 0.5, &[(2.0, 0.1)]);
            tone(&mut buf, 0.3, 1.2, 523.25, 0.45, &[(2.0, 0.1)]);
        }
        "digital" => {
            for k in 0..3 {
                tone(&mut buf, k as f32 * 0.14, 0.11, 1760.0, 0.45, &[(1.5, 0.3)]);
            }
        }
        "ping" => {
            tone(&mut buf, 0.0, 0.9, 1568.0, 0.5, &[(2.0, 0.15)]);
        }
        "gong" => {
            tone(&mut buf, 0.0, 1.6, 196.0, 0.6, &[(2.0, 0.4), (2.9, 0.3), (4.1, 0.2), (5.4, 0.1)]);
        }
        _ => {
            // chime: gentle major triad arpeggio
            tone(&mut buf, 0.0, 1.0, 659.25, 0.45, &[(2.0, 0.15)]);
            tone(&mut buf, 0.15, 1.0, 830.61, 0.4, &[(2.0, 0.15)]);
            tone(&mut buf, 0.3, 1.2, 987.77, 0.4, &[(2.0, 0.15)]);
        }
    }
    buf
}

fn to_wav(samples: &[f32], gain: f32) -> Vec<u8> {
    let n = samples.len() as u32;
    let data_len = n * 2;
    let mut out = Vec::with_capacity((44 + data_len) as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&RATE.to_le_bytes());
    out.extend_from_slice(&(RATE * 2).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    let g = gain.clamp(0.0, 1.0);
    for s in samples {
        let v = (s * g).clamp(-1.0, 1.0);
        out.extend_from_slice(&((v * 32767.0) as i16).to_le_bytes());
    }
    out
}

pub fn wav_bytes(name: &str, volume: f32) -> Vec<u8> {
    to_wav(&synth(name), volume)
}

#[cfg(windows)]
pub fn play(name: &str, volume: f32) {
    use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT};
    use windows::core::PCWSTR;
    let wav = wav_bytes(name, volume);
    let m = BUFFER.get_or_init(|| Mutex::new(Vec::new()));
    let mut g = m.lock();
    // Stop any sound currently playing before replacing the buffer it points at.
    unsafe {
        let _ = PlaySoundW(PCWSTR::null(), None, SND_ASYNC);
    }
    *g = wav;
    unsafe {
        let _ = PlaySoundW(PCWSTR(g.as_ptr() as *const u16), None, SND_MEMORY | SND_ASYNC | SND_NODEFAULT);
    }
}

#[cfg(not(windows))]
pub fn play(_name: &str, _volume: f32) {}
