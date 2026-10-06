//! Voice capture: microphone recording (cpal/WASAPI), offline transcription with whisper.cpp,
//! and the Windows speech recognizer as a zero-setup alternative.

use crate::store::Store;
use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

const TARGET_RATE: u32 = 16_000;
const MAX_SECONDS: f32 = 300.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    pub recording: bool,
    pub transcribing: bool,
    pub engine: String,
    pub whisper_model: String,
    pub whisper_ready: bool,
    pub models_dir: String,
    pub devices: Vec<String>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub text: String,
    pub engine: String,
    pub duration_ms: u64,
    pub audio: Option<String>,
    pub error: Option<String>,
}

struct Recording {
    samples: Arc<Mutex<Vec<f32>>>,
    rate: u32,
    channels: u16,
    started: Instant,
    stop_tx: mpsc::Sender<()>,
    /// Live text from the Windows recognizer, if that engine is active.
    live_text: Arc<Mutex<String>>,
    #[cfg(windows)]
    winrt: Option<WinrtSession>,
}

static RECORDING: Mutex<Option<Recording>> = Mutex::new(None);
static TRANSCRIBING: AtomicBool = AtomicBool::new(false);
static WHISPER: OnceLock<Mutex<Option<(String, whisper_rs::WhisperContext)>>> = OnceLock::new();
static DOWNLOADING: AtomicBool = AtomicBool::new(false);
static LEVEL_SEQ: AtomicU64 = AtomicU64::new(0);

fn models_dir(app: &AppHandle) -> PathBuf {
    let d = app.state::<Arc<Store>>().app_config_dir().join("models");
    let _ = std::fs::create_dir_all(&d);
    d
}

pub fn model_path(app: &AppHandle, model: &str) -> PathBuf {
    models_dir(app).join(format!("ggml-{model}.bin"))
}

pub fn input_devices() -> Vec<String> {
    let host = cpal::default_host();
    host.input_devices().map(|it| it.filter_map(|d| d.name().ok()).collect()).unwrap_or_default()
}

pub fn status(app: &AppHandle, engine: &str, model: &str) -> VoiceStatus {
    let rec = RECORDING.lock();
    VoiceStatus {
        recording: rec.is_some(),
        transcribing: TRANSCRIBING.load(Ordering::Relaxed),
        engine: engine.into(),
        whisper_model: model.into(),
        whisper_ready: model_path(app, model).exists(),
        models_dir: models_dir(app).to_string_lossy().into(),
        devices: input_devices(),
        elapsed_ms: rec.as_ref().map(|r| r.started.elapsed().as_millis() as u64).unwrap_or(0),
    }
}

/// Start capturing from the microphone. `use_winrt` also starts the Windows recognizer live.
pub fn start(app: &AppHandle, device_name: Option<String>, language: String, use_winrt: bool) -> Result<()> {
    {
        if RECORDING.lock().is_some() {
            return Ok(()); // key repeat while holding
        }
    }
    let host = cpal::default_host();
    let device = match device_name.as_deref().filter(|n| !n.is_empty()) {
        Some(name) => host.input_devices()?.find(|d| d.name().map(|n| n == name).unwrap_or(false)).or_else(|| host.default_input_device()),
        None => host.default_input_device(),
    }
    .ok_or_else(|| anyhow!("no microphone found"))?;
    let config = device.default_input_config().context("microphone config")?;
    let rate = config.sample_rate().0;
    let channels = config.channels();
    let samples = Arc::new(Mutex::new(Vec::<f32>::with_capacity((rate as usize) * 30)));
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<()>>();
    let app2 = app.clone();
    let samples2 = samples.clone();
    let fmt = config.sample_format();
    let cfg: cpal::StreamConfig = config.into();
    let max_samples = (MAX_SECONDS * rate as f32) as usize * channels as usize;

    // cpal streams are not Send: own the stream on a dedicated thread.
    std::thread::Builder::new()
        .name("voice-capture".into())
        .spawn(move || {
            let last_emit = Arc::new(Mutex::new(Instant::now()));
            let err_fn = |e| log::warn!("audio stream error: {e}");
            let make = |push: Box<dyn Fn(&[f32]) + Send>| -> Result<cpal::Stream> {
                let s = match fmt {
                    cpal::SampleFormat::F32 => device.build_input_stream(&cfg, move |d: &[f32], _| push(d), err_fn, None)?,
                    cpal::SampleFormat::I16 => device.build_input_stream(&cfg, move |d: &[i16], _| push(&d.iter().map(|v| *v as f32 / 32768.0).collect::<Vec<_>>()), err_fn, None)?,
                    cpal::SampleFormat::U16 => device.build_input_stream(&cfg, move |d: &[u16], _| push(&d.iter().map(|v| (*v as f32 - 32768.0) / 32768.0).collect::<Vec<_>>()), err_fn, None)?,
                    f => return Err(anyhow!("unsupported sample format {f:?}")),
                };
                Ok(s)
            };
            let samples3 = samples2.clone();
            let app3 = app2.clone();
            let le = last_emit.clone();
            let push: Box<dyn Fn(&[f32]) + Send> = Box::new(move |data: &[f32]| {
                let mut buf = samples3.lock();
                if buf.len() < max_samples {
                    buf.extend_from_slice(data);
                }
                drop(buf);
                let mut t = le.lock();
                if t.elapsed().as_millis() >= 80 {
                    *t = Instant::now();
                    let rms = (data.iter().map(|v| v * v).sum::<f32>() / data.len().max(1) as f32).sqrt();
                    let _ = app3.emit("sid://voice/level", serde_json::json!({ "level": (rms * 6.0).min(1.0), "seq": LEVEL_SEQ.fetch_add(1, Ordering::Relaxed) }));
                }
            });
            match make(push) {
                Ok(stream) => {
                    if let Err(e) = stream.play() {
                        let _ = ready_tx.send(Err(anyhow!("start microphone: {e}")));
                        return;
                    }
                    let _ = ready_tx.send(Ok(()));
                    let _ = stop_rx.recv();
                    drop(stream);
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                }
            }
        })
        .context("spawn capture thread")?;
    ready_rx.recv().map_err(|_| anyhow!("capture thread died"))??;

    let live_text = Arc::new(Mutex::new(String::new()));
    #[cfg(windows)]
    let winrt = if use_winrt { winrt_start(&language, live_text.clone()).map_err(|e| log::warn!("windows speech: {e}")).ok() } else { None };
    #[cfg(not(windows))]
    let _ = (use_winrt, language);

    *RECORDING.lock() = Some(Recording {
        samples,
        rate,
        channels,
        started: Instant::now(),
        stop_tx,
        live_text,
        #[cfg(windows)]
        winrt,
    });
    let _ = app.emit("sid://voice/state", "recording");
    Ok(())
}

pub fn is_recording() -> bool {
    RECORDING.lock().is_some()
}

pub fn cancel(app: &AppHandle) {
    if let Some(rec) = RECORDING.lock().take() {
        let _ = rec.stop_tx.send(());
        #[cfg(windows)]
        if let Some(w) = rec.winrt {
            w.stop();
        }
    }
    let _ = app.emit("sid://voice/state", "idle");
}

fn resample_mono(samples: &[f32], rate: u32, channels: u16) -> Vec<f32> {
    let ch = channels.max(1) as usize;
    let mono: Vec<f32> = samples.chunks(ch).map(|c| c.iter().sum::<f32>() / ch as f32).collect();
    if rate == TARGET_RATE {
        return mono;
    }
    let ratio = rate as f64 / TARGET_RATE as f64;
    let out_len = (mono.len() as f64 / ratio) as usize;
    (0..out_len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let idx = pos as usize;
            let frac = (pos - idx as f64) as f32;
            let a = mono.get(idx).copied().unwrap_or(0.0);
            let b = mono.get(idx + 1).copied().unwrap_or(a);
            a + (b - a) * frac
        })
        .collect()
}

fn wav_bytes(mono16k: &[f32]) -> Vec<u8> {
    let spec = hound::WavSpec { channels: 1, sample_rate: TARGET_RATE, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut cursor = std::io::Cursor::new(Vec::new());
    {
        let mut w = hound::WavWriter::new(&mut cursor, spec).expect("wav");
        for s in mono16k {
            let _ = w.write_sample((s.clamp(-1.0, 1.0) * 32767.0) as i16);
        }
        let _ = w.finalize();
    }
    cursor.into_inner()
}

/// Stop recording and transcribe. engine: "whisper" | "windows" | "auto".
pub fn stop_and_transcribe(app: &AppHandle, engine: &str, model: &str, language: &str, keep_audio: bool) -> Transcript {
    let rec = RECORDING.lock().take();
    let Some(rec) = rec else {
        return Transcript { text: String::new(), engine: engine.into(), duration_ms: 0, audio: None, error: Some("not recording".into()) };
    };
    let _ = rec.stop_tx.send(());
    let duration_ms = rec.started.elapsed().as_millis() as u64;
    let _ = app.emit("sid://voice/state", "transcribing");
    TRANSCRIBING.store(true, Ordering::Relaxed);
    #[cfg(windows)]
    let live = rec.winrt.as_ref().map(|w| {
        w.stop();
        rec.live_text.lock().trim().to_string()
    });
    #[cfg(not(windows))]
    let live: Option<String> = None;
    let raw = rec.samples.lock().clone();
    let mono = resample_mono(&raw, rec.rate, rec.channels);

    let silent = duration_ms < 350 || mono.iter().all(|s| s.abs() < 0.002);
    let mut audio_name = None;
    if keep_audio && !silent && mono.len() > TARGET_RATE as usize / 4 {
        let store = app.state::<Arc<Store>>();
        audio_name = store.save_attachment(&wav_bytes(&mono), "wav").ok();
    }
    let mut error = None;
    let mut used = engine.to_string();
    let whisper_available = model_path(app, model).exists();
    let want_whisper = engine == "whisper" || (engine == "auto" && whisper_available);
    let text = if silent {
        error = Some("Nothing was heard. Hold the key a little longer and speak clearly.".into());
        String::new()
    } else if want_whisper {
        used = "whisper".into();
        match whisper_transcribe(app, model, language, &mono) {
            Ok(t) => t,
            Err(e) => {
                error = Some(e.to_string());
                live.clone().unwrap_or_default()
            }
        }
    } else {
        used = "windows".into();
        match live {
            Some(t) if !t.is_empty() => t,
            Some(_) => {
                error = Some("Windows speech recognition returned nothing. Check Settings → Privacy → Speech (online speech recognition), or download the offline Whisper model.".into());
                String::new()
            }
            None => {
                error = Some("Windows speech recognition is unavailable. Download the offline Whisper model in Settings → Voice.".into());
                String::new()
            }
        }
    };
    TRANSCRIBING.store(false, Ordering::Relaxed);
    let _ = app.emit("sid://voice/state", "idle");
    Transcript { text: tidy(&text), engine: used, duration_ms, audio: audio_name, error }
}

fn tidy(t: &str) -> String {
    let mut s = t.replace("[BLANK_AUDIO]", "").replace("(blank audio)", "").trim().to_string();
    s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if let Some(first) = s.chars().next() {
        if first.is_lowercase() {
            s = first.to_uppercase().collect::<String>() + &s[first.len_utf8()..];
        }
    }
    s
}

fn whisper_transcribe(app: &AppHandle, model: &str, language: &str, mono16k: &[f32]) -> Result<String> {
    use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
    let path = model_path(app, model);
    if !path.exists() {
        return Err(anyhow!("Whisper model '{model}' is not downloaded yet (Settings → Voice)."));
    }
    let cell = WHISPER.get_or_init(|| Mutex::new(None));
    let mut guard = cell.lock();
    let needs_load = guard.as_ref().map(|(m, _)| m != model).unwrap_or(true);
    if needs_load {
        let ctx = WhisperContext::new_with_params(&path, WhisperContextParameters::default()).map_err(|e| anyhow!("load model: {e:?}"))?;
        *guard = Some((model.to_string(), ctx));
    }
    let (_, ctx) = guard.as_ref().unwrap();
    let mut state = ctx.create_state().map_err(|e| anyhow!("whisper state: {e:?}"))?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    let lang = if language.is_empty() || model.ends_with(".en") { "en".to_string() } else { language.to_string() };
    params.set_language(Some(&lang));
    params.set_translate(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_n_threads((std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4) as i32).clamp(2, 8));
    // whisper needs at least ~1s of audio
    let mut audio = mono16k.to_vec();
    if audio.len() < TARGET_RATE as usize {
        audio.resize(TARGET_RATE as usize + 1600, 0.0);
    }
    state.full(params, &audio).map_err(|e| anyhow!("transcribe: {e:?}"))?;
    let n = state.full_n_segments();
    let mut out = String::new();
    for i in 0..n {
        if let Some(seg) = state.get_segment(i) {
            if let Ok(text) = seg.to_str_lossy() {
                out.push_str(&text);
                out.push(' ');
            }
        }
    }
    Ok(out)
}

/// Download a ggml model from Hugging Face with progress events.
pub async fn download_model(app: AppHandle, model: String) -> Result<String> {
    if DOWNLOADING.swap(true, Ordering::Relaxed) {
        return Err(anyhow!("a download is already running"));
    }
    let result = download_inner(&app, &model).await;
    DOWNLOADING.store(false, Ordering::Relaxed);
    result
}

async fn download_inner(app: &AppHandle, model: &str) -> Result<String> {
    use futures_util::StreamExt;
    let allowed = ["tiny.en", "base.en", "small.en", "tiny", "base"];
    if !allowed.contains(&model) {
        return Err(anyhow!("unknown model"));
    }
    let url = format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{model}.bin");
    let dest = model_path(app, model);
    let tmp = dest.with_extension("part");
    let client = reqwest::Client::builder().user_agent("Dayflit/1.0").build()?;
    let resp = client.get(&url).send().await?.error_for_status()?;
    let total = resp.content_length().unwrap_or(0);
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(&tmp).await?;
    let mut done = 0u64;
    let mut last = Instant::now();
    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        done += chunk.len() as u64;
        if last.elapsed().as_millis() > 250 {
            last = Instant::now();
            let _ = app.emit("sid://voice/download", serde_json::json!({ "model": model, "done": done, "total": total }));
        }
    }
    file.flush().await?;
    drop(file);
    if total > 0 && done < total {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(anyhow!("download incomplete"));
    }
    tokio::fs::rename(&tmp, &dest).await?;
    let _ = app.emit("sid://voice/download", serde_json::json!({ "model": model, "done": done, "total": total, "finished": true }));
    Ok(dest.to_string_lossy().into())
}

/// Transcribe an existing WAV file (voice memo import, tests).
pub fn transcribe_file(app: &AppHandle, path: &str, model: &str, language: &str) -> Result<Transcript> {
    let mut reader = hound::WavReader::open(path).context("open wav")?;
    let spec = reader.spec();
    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().filter_map(|s| s.ok()).collect(),
        hound::SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader.samples::<i32>().filter_map(|s| s.ok()).map(|v| v as f32 / max).collect()
        }
    };
    let mono = resample_mono(&samples, spec.sample_rate, spec.channels);
    let duration_ms = (mono.len() as u64 * 1000) / TARGET_RATE as u64;
    TRANSCRIBING.store(true, Ordering::Relaxed);
    let r = whisper_transcribe(app, model, language, &mono);
    TRANSCRIBING.store(false, Ordering::Relaxed);
    match r {
        Ok(t) => Ok(Transcript { text: tidy(&t), engine: "whisper".into(), duration_ms, audio: None, error: None }),
        Err(e) => Ok(Transcript { text: String::new(), engine: "whisper".into(), duration_ms, audio: None, error: Some(e.to_string()) }),
    }
}

pub fn delete_model(app: &AppHandle, model: &str) -> Result<()> {
    let p = model_path(app, model);
    if p.exists() {
        std::fs::remove_file(p)?;
    }
    if let Some(cell) = WHISPER.get() {
        let mut g = cell.lock();
        if g.as_ref().map(|(m, _)| m == model).unwrap_or(false) {
            *g = None;
        }
    }
    Ok(())
}

// ---------- Windows speech recognizer (live, continuous dictation) ----------

#[cfg(windows)]
struct WinrtSession {
    recognizer: windows::Media::SpeechRecognition::SpeechRecognizer,
}

#[cfg(windows)]
impl WinrtSession {
    fn stop(&self) {
        if let Ok(s) = self.recognizer.ContinuousRecognitionSession() {
            let _ = s.StopAsync().and_then(|a| a.join());
        }
    }
}

#[cfg(windows)]
fn winrt_start(language: &str, out: Arc<Mutex<String>>) -> Result<WinrtSession> {
    use windows::core::HSTRING;
    use windows::Foundation::TypedEventHandler;
    use windows::Globalization::Language;
    use windows::Media::SpeechRecognition::{SpeechContinuousRecognitionResultGeneratedEventArgs, SpeechContinuousRecognitionSession, SpeechRecognitionTopicConstraint, SpeechRecognitionScenario, SpeechRecognizer};
    crate::media::ensure_com();
    let tag = if language.is_empty() { "en-US".to_string() } else if language.len() == 2 { format!("{language}-{}", language.to_uppercase()) } else { language.to_string() };
    let lang = Language::CreateLanguage(&HSTRING::from(tag)).map_err(|e| anyhow!("language: {e}"))?;
    let recognizer = SpeechRecognizer::Create(&lang).map_err(|e| anyhow!("create recognizer: {e}"))?;
    let constraint = SpeechRecognitionTopicConstraint::Create(SpeechRecognitionScenario::Dictation, &HSTRING::from("dictation")).map_err(|e| anyhow!("{e}"))?;
    recognizer.Constraints().map_err(|e| anyhow!("{e}"))?.Append(&constraint).map_err(|e| anyhow!("{e}"))?;
    let comp = recognizer.CompileConstraintsAsync().map_err(|e| anyhow!("{e}"))?.join().map_err(|e| anyhow!("compile: {e}"))?;
    let status = comp.Status().map_err(|e| anyhow!("{e}"))?;
    if status.0 != 0 {
        return Err(anyhow!("constraints not accepted ({})", status.0));
    }
    let session = recognizer.ContinuousRecognitionSession().map_err(|e| anyhow!("{e}"))?;
    let out2 = out.clone();
    session
        .ResultGenerated(&TypedEventHandler::<SpeechContinuousRecognitionSession, SpeechContinuousRecognitionResultGeneratedEventArgs>::new(move |_, args| {
            if let Some(a) = args.as_ref() {
                if let Ok(r) = a.Result() {
                    if let Ok(t) = r.Text() {
                        let mut g = out2.lock();
                        if !g.is_empty() {
                            g.push(' ');
                        }
                        g.push_str(&t.to_string());
                    }
                }
            }
            Ok(())
        }))
        .map_err(|e| anyhow!("{e}"))?;
    session.StartAsync().map_err(|e| anyhow!("{e}"))?.join().map_err(|e| anyhow!("start session: {e} (enable Settings → Privacy → Speech → Online speech recognition)"))?;
    Ok(WinrtSession { recognizer })
}
