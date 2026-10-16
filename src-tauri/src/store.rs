//! Local-first document store.
//!
//! Each collection lives in `<data_dir>/<name>.json` wrapped in an envelope with a CRC32
//! of the canonical payload. Writes are atomic (tmp + fsync + replace, with retries for
//! sync-folder sharing violations). The previous good copy is kept as `<name>.json.bak`.
//! Rolling zip backups live in `<data_dir>/backups`.

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const ENVELOPE_VERSION: u32 = 1;
pub const MAX_BACKUPS: usize = 30;

/// Collections that are persisted in the data directory. Anything else is refused.
pub const COLLECTIONS: &[&str] = &[
    "tasks",
    "notes",
    "habits",
    "focus_history",
    "settings",
    "calendar_sources",
    "calendar_cache",
    "clips",
    "link_cache",
    "stats",
    "onboarding",
    "journal",
    "activity",
    "life",
    "canvas",
];

#[derive(Debug, Serialize, Deserialize)]
struct Envelope {
    sid: u32,
    collection: String,
    saved_at: DateTime<Utc>,
    crc: u32,
    data: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppConfig {
    data_dir: PathBuf,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LoadResult {
    pub data: Option<Value>,
    pub recovered_from: Option<String>,
    pub saved_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub file: String,
    pub path: String,
    pub created_at: DateTime<Utc>,
    pub size: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DataDirInfo {
    pub path: String,
    pub app_config_dir: String,
    pub images_dir: String,
    pub backups_dir: String,
    pub logs_dir: String,
    pub collections: Vec<CollectionInfo>,
    pub total_bytes: u64,
    pub image_count: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInfo {
    pub name: String,
    pub bytes: u64,
    pub modified: Option<DateTime<Utc>>,
}

pub struct Store {
    app_config_dir: PathBuf,
    data_dir: RwLock<PathBuf>,
    write_lock: parking_lot::Mutex<()>,
}

fn canonical(v: &Value) -> String {
    // serde_json::Value uses BTreeMap (preserve_order disabled) so key order is deterministic.
    serde_json::to_string(v).unwrap_or_default()
}

fn crc(s: &str) -> u32 {
    let mut h = crc32fast::Hasher::new();
    h.update(s.as_bytes());
    h.finalize()
}

impl Store {
    pub fn new() -> Result<Self> {
        let app_config_dir = dirs::config_dir()
            .ok_or_else(|| anyhow!("no config dir"))?
            .join("Dayflit");
        fs::create_dir_all(&app_config_dir)?;
        let cfg_path = app_config_dir.join("config.json");
        let default_data = app_config_dir.join("data");
        let data_dir = match fs::read_to_string(&cfg_path)
            .ok()
            .and_then(|s| serde_json::from_str::<AppConfig>(&s).ok())
        {
            Some(c) if c.data_dir.is_dir() || fs::create_dir_all(&c.data_dir).is_ok() => c.data_dir,
            _ => default_data,
        };
        let store = Self {
            app_config_dir,
            data_dir: RwLock::new(data_dir),
            write_lock: parking_lot::Mutex::new(()),
        };
        store.ensure_layout()?;
        store.write_config()?;
        Ok(store)
    }

    #[allow(dead_code)]
    pub fn new_with_dirs(app_config_dir: PathBuf, data_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&app_config_dir)?;
        fs::create_dir_all(&data_dir)?;
        let store = Self {
            app_config_dir,
            data_dir: RwLock::new(data_dir),
            write_lock: parking_lot::Mutex::new(()),
        };
        store.ensure_layout()?;
        store.write_config()?;
        Ok(store)
    }

    pub fn app_config_dir(&self) -> PathBuf {
        self.app_config_dir.clone()
    }

    pub fn data_dir(&self) -> PathBuf {
        self.data_dir.read().clone()
    }

    pub fn images_dir(&self) -> PathBuf {
        self.data_dir().join("images")
    }

    pub fn backups_dir(&self) -> PathBuf {
        self.data_dir().join("backups")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.app_config_dir.join("logs")
    }

    fn ensure_layout(&self) -> Result<()> {
        let d = self.data_dir();
        fs::create_dir_all(&d)?;
        fs::create_dir_all(d.join("images"))?;
        fs::create_dir_all(d.join("backups"))?;
        fs::create_dir_all(self.logs_dir())?;
        let marker = d.join(".dayflit");
        if !marker.exists() {
            fs::write(&marker, "Dayflit data folder. Do not edit files while Dayflit is running.\n")?;
        }
        Ok(())
    }

    fn write_config(&self) -> Result<()> {
        let cfg = AppConfig { data_dir: self.data_dir() };
        atomic_write(
            &self.app_config_dir.join("config.json"),
            serde_json::to_string_pretty(&cfg)?.as_bytes(),
        )
    }

    fn check_name(name: &str) -> Result<()> {
        if COLLECTIONS.contains(&name) {
            Ok(())
        } else {
            Err(anyhow!("unknown collection: {name}"))
        }
    }

    fn path_for(&self, name: &str) -> PathBuf {
        self.data_dir().join(format!("{name}.json"))
    }

    fn parse_envelope(bytes: &[u8], name: &str) -> Result<Envelope> {
        let env: Envelope = serde_json::from_slice(bytes).context("parse envelope")?;
        if env.sid > ENVELOPE_VERSION {
            return Err(anyhow!("envelope from a newer Dayflit version ({})", env.sid));
        }
        if env.collection != name {
            return Err(anyhow!("collection mismatch"));
        }
        let computed = crc(&canonical(&env.data));
        if computed != env.crc {
            return Err(anyhow!("checksum mismatch"));
        }
        Ok(env)
    }

    fn read_env(path: &Path, name: &str) -> Result<Envelope> {
        let b = fs::read(path)?;
        Self::parse_envelope(&b, name)
    }

    /// Load a collection, trying `.bak` and zip backups if the primary is corrupt.
    pub fn load(&self, name: &str) -> Result<LoadResult> {
        Self::check_name(name)?;
        let path = self.path_for(name);
        let bak = path.with_extension("json.bak");
        if !path.exists() {
            if bak.exists() {
                if let Ok(env) = Self::read_env(&bak, name) {
                    log::warn!("{name}: primary missing, recovered from .bak");
                    return Ok(LoadResult { data: Some(env.data), recovered_from: Some("bak".into()), saved_at: Some(env.saved_at) });
                }
            }
            return Ok(LoadResult { data: None, recovered_from: None, saved_at: None });
        }
        match Self::read_env(&path, name) {
            Ok(env) => Ok(LoadResult { data: Some(env.data), recovered_from: None, saved_at: Some(env.saved_at) }),
            Err(e) => {
                log::error!("{name}: primary corrupt ({e}); attempting recovery");
                let quarantine = path.with_extension(format!("json.corrupt-{}", Utc::now().format("%Y%m%d%H%M%S")));
                let _ = fs::copy(&path, &quarantine);
                if let Ok(env) = Self::read_env(&bak, name) {
                    return Ok(LoadResult { data: Some(env.data), recovered_from: Some("bak".into()), saved_at: Some(env.saved_at) });
                }
                for b in self.list_backups().unwrap_or_default() {
                    if let Ok(env) = self.read_from_backup(&b.path, name) {
                        return Ok(LoadResult { data: Some(env.data), recovered_from: Some(b.file), saved_at: Some(env.saved_at) });
                    }
                }
                Err(anyhow!("{name}: unrecoverable: {e}"))
            }
        }
    }

    pub fn save(&self, name: &str, data: Value) -> Result<()> {
        Self::check_name(name)?;
        let _guard = self.write_lock.lock();
        let path = self.path_for(name);
        let canon = canonical(&data);
        let env = Envelope { sid: ENVELOPE_VERSION, collection: name.to_string(), saved_at: Utc::now(), crc: crc(&canon), data };
        let bytes = serde_json::to_vec(&env)?;
        if path.exists() {
            if let Ok(prev) = fs::read(&path) {
                if Self::parse_envelope(&prev, name).is_ok() {
                    let _ = atomic_write(&path.with_extension("json.bak"), &prev);
                }
            }
        }
        atomic_write(&path, &bytes)
    }

    pub fn save_image(&self, bytes: &[u8], ext: &str) -> Result<String> {
        let ext = match ext.to_ascii_lowercase().as_str() {
            "jpg" | "jpeg" => "jpg",
            "gif" => "gif",
            "webp" => "webp",
            _ => "png",
        };
        let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
        let dir = self.images_dir();
        fs::create_dir_all(&dir)?;
        atomic_write(&dir.join(&name), bytes)?;
        Ok(name)
    }

    /// Save any attachment (audio, video, documents) next to images. Returns the file name.
    pub fn save_attachment(&self, bytes: &[u8], ext: &str) -> Result<String> {
        let ext = ext.trim_start_matches('.').to_ascii_lowercase();
        let allowed = ["png", "jpg", "jpeg", "gif", "webp", "wav", "webm", "mp3", "m4a", "ogg", "mp4", "pdf", "txt", "md"];
        if !allowed.contains(&ext.as_str()) {
            return Err(anyhow!("unsupported attachment type: {ext}"));
        }
        let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
        let dir = self.images_dir();
        fs::create_dir_all(&dir)?;
        atomic_write(&dir.join(&name), bytes)?;
        Ok(name)
    }

    pub fn is_safe_attachment_filename(name: &str) -> bool {
        let trimmed = name.trim();
        if name != trimmed || trimmed.is_empty() || trimmed.len() > 255 {
            return false;
        }
        // Disallow path separators, traversal sequences, NTFS alternate data streams, control characters, and invalid Windows filename characters
        if trimmed.contains('/')
            || trimmed.contains('\\')
            || trimmed.contains("..")
            || trimmed.contains(':')
            || trimmed.contains('*')
            || trimmed.contains('?')
            || trimmed.contains('"')
            || trimmed.contains('<')
            || trimmed.contains('>')
            || trimmed.contains('|')
            || trimmed.chars().any(|c| c.is_control())
        {
            return false;
        }
        // Windows auto-trims trailing dots and spaces, which causes file truncation / ADS bypass
        if trimmed.ends_with('.') || trimmed.ends_with(' ') {
            return false;
        }
        // Reject URL-encoded path traversal sequences (%2e = ., %2f = /, %5c = \, %00 = null byte)
        let lower = trimmed.to_ascii_lowercase();
        if lower.contains("%2e")
            || lower.contains("%2f")
            || lower.contains("%5c")
            || lower.contains("%00")
            || lower.contains("%25")
        {
            return false;
        }
        // Disallow Windows DOS reserved device names (both with and without extension)
        // E.g., CON, CON.png, AUX.txt, NUL.jpg, COM1.dat, LPT1.pdf
        let stem = Path::new(trimmed)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(trimmed)
            .to_ascii_uppercase();
        const RESERVED_NAMES: &[&str] = &[
            "CON", "PRN", "AUX", "NUL",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
            "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
            "CONIN$", "CONOUT$",
        ];
        if RESERVED_NAMES.contains(&stem.as_str()) {
            return false;
        }
        // Extension whitelist
        let ext = Path::new(trimmed)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        const ALLOWED_EXTS: &[&str] = &[
            "png", "jpg", "jpeg", "gif", "webp", "wav", "webm", "mp3", "m4a", "ogg", "mp4", "pdf", "txt", "md",
        ];
        ALLOWED_EXTS.contains(&ext.as_str())
    }

    pub fn image_path(&self, name: &str) -> Result<PathBuf> {
        let trimmed = name.trim();
        if !Self::is_safe_attachment_filename(trimmed) {
            return Err(anyhow!("invalid image name"));
        }
        let p = self.images_dir().join(trimmed);
        if p.parent() != Some(self.images_dir().as_path()) {
            return Err(anyhow!("image path escape detected"));
        }
        Ok(p)
    }

    pub fn delete_image(&self, name: &str) -> Result<()> {
        let p = self.image_path(name)?;
        if p.exists() {
            fs::remove_file(p)?;
        }
        Ok(())
    }

    pub fn list_images(&self) -> Vec<String> {
        fs::read_dir(self.images_dir())
            .map(|rd| rd.flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect())
            .unwrap_or_default()
    }

    pub fn info(&self) -> Result<DataDirInfo> {
        let d = self.data_dir();
        let mut collections = vec![];
        let mut total = 0u64;
        for c in COLLECTIONS {
            let p = self.path_for(c);
            if let Ok(m) = fs::metadata(&p) {
                total += m.len();
                collections.push(CollectionInfo { name: c.to_string(), bytes: m.len(), modified: m.modified().ok().map(DateTime::<Utc>::from) });
            }
        }
        let mut image_count = 0;
        if let Ok(rd) = fs::read_dir(self.images_dir()) {
            for e in rd.flatten() {
                if let Ok(m) = e.metadata() {
                    total += m.len();
                    image_count += 1;
                }
            }
        }
        Ok(DataDirInfo {
            path: d.to_string_lossy().into(),
            app_config_dir: self.app_config_dir.to_string_lossy().into(),
            images_dir: self.images_dir().to_string_lossy().into(),
            backups_dir: self.backups_dir().to_string_lossy().into(),
            logs_dir: self.logs_dir().to_string_lossy().into(),
            collections,
            total_bytes: total,
            image_count,
        })
    }

    // ---------- backups ----------

    pub fn list_backups(&self) -> Result<Vec<BackupInfo>> {
        let mut out = vec![];
        if let Ok(rd) = fs::read_dir(self.backups_dir()) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().map(|x| x == "zip").unwrap_or(false) {
                    let m = e.metadata()?;
                    out.push(BackupInfo {
                        file: p.file_name().unwrap().to_string_lossy().into(),
                        path: p.to_string_lossy().into(),
                        created_at: m.modified().map(DateTime::<Utc>::from).unwrap_or_else(|_| Utc::now()),
                        size: m.len(),
                    });
                }
            }
        }
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(out)
    }

    /// Create a zip backup of all collections (images included when `with_images`).
    pub fn backup_now(&self, with_images: bool, label: &str) -> Result<BackupInfo> {
        let _guard = self.write_lock.lock();
        let dir = self.backups_dir();
        fs::create_dir_all(&dir)?;
        let stamp = Utc::now().format("%Y%m%d-%H%M%S");
        let safe_label: String = label.chars().filter(|c| c.is_alphanumeric() || *c == '_').take(24).collect();
        let file = if safe_label.is_empty() { format!("dayflit-backup-{stamp}.zip") } else { format!("dayflit-backup-{stamp}-{safe_label}.zip") };
        let path = dir.join(&file);
        let tmp = dir.join(format!("{file}.tmp"));
        {
            let f = File::create(&tmp)?;
            let mut z = zip::ZipWriter::new(f);
            let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            for c in COLLECTIONS {
                let p = self.path_for(c);
                if let Ok(bytes) = fs::read(&p) {
                    z.start_file(format!("{c}.json"), opts)?;
                    z.write_all(&bytes)?;
                }
            }
            if with_images {
                if let Ok(rd) = fs::read_dir(self.images_dir()) {
                    for e in rd.flatten() {
                        if let Ok(bytes) = fs::read(e.path()) {
                            z.start_file(format!("images/{}", e.file_name().to_string_lossy()), opts)?;
                            z.write_all(&bytes)?;
                        }
                    }
                }
            }
            z.finish()?;
        }
        fs::rename(&tmp, &path)?;
        self.prune_backups()?;
        let m = fs::metadata(&path)?;
        Ok(BackupInfo { file, path: path.to_string_lossy().into(), created_at: Utc::now(), size: m.len() })
    }

    fn prune_backups(&self) -> Result<()> {
        let list = self.list_backups()?;
        // Automatic backups have exactly 3 dashes: dayflit-backup-DATE-TIME.zip. Labelled ones are kept.
        let auto: Vec<_> = list
            .iter()
            .filter(|b| b.file.starts_with("dayflit-backup-") && b.file.matches('-').count() == 3)
            .collect();
        for b in auto.iter().skip(MAX_BACKUPS) {
            let _ = fs::remove_file(&b.path);
        }
        Ok(())
    }

    fn read_from_backup(&self, zip_path: &str, name: &str) -> Result<Envelope> {
        let f = File::open(zip_path)?;
        let mut z = zip::ZipArchive::new(f)?;
        let mut entry = z.by_name(&format!("{name}.json"))?;
        let mut bytes = vec![];
        entry.read_to_end(&mut bytes)?;
        Self::parse_envelope(&bytes, name)
    }

    /// Restore every collection (and images) from a backup zip. Current data is backed up first.
    pub fn restore_backup(&self, zip_path: &str) -> Result<Vec<String>> {
        self.backup_now(true, "prerestore")?;
        let _guard = self.write_lock.lock();
        let f = File::open(zip_path)?;
        let mut z = zip::ZipArchive::new(f)?;
        let mut restored = vec![];
        for i in 0..z.len() {
            let mut entry = z.by_index(i)?;
            let n = entry.name().to_string();
            let mut bytes = vec![];
            entry.read_to_end(&mut bytes)?;
            if let Some(stem) = n.strip_suffix(".json") {
                if COLLECTIONS.contains(&stem) && Self::parse_envelope(&bytes, stem).is_ok() {
                    atomic_write(&self.path_for(stem), &bytes)?;
                    restored.push(stem.to_string());
                }
            } else if let Some(img) = n.strip_prefix("images/") {
                let img_clean = img.trim();
                if Self::is_safe_attachment_filename(img_clean) {
                    let target = self.images_dir().join(img_clean);
                    if target.parent() == Some(self.images_dir().as_path()) {
                        atomic_write(&target, &bytes)?;
                    }
                }
            }
        }
        Ok(restored)
    }

    // ---------- data folder migration ----------

    /// Move or copy the data folder to `new_dir`. Modes: "move" (copy then delete old),
    /// "copy" (leave old in place), "adopt" (use existing Dayflit data at new_dir without copying).
    pub fn change_data_dir(&self, new_dir: &Path, mode: &str) -> Result<PathBuf> {
        let _guard = self.write_lock.lock();
        let old = self.data_dir();
        let new_dir = new_dir.to_path_buf();
        if new_dir == old {
            return Ok(old);
        }
        if new_dir.starts_with(&old) {
            return Err(anyhow!("new folder cannot be inside the current data folder"));
        }
        fs::create_dir_all(&new_dir)?;
        let has_existing = new_dir.join(".dayflit").exists() || COLLECTIONS.iter().any(|c| new_dir.join(format!("{c}.json")).exists());
        match mode {
            "adopt" => {
                if !has_existing {
                    return Err(anyhow!("no Dayflit data found in that folder"));
                }
            }
            "move" | "copy" => {
                if has_existing {
                    return Err(anyhow!("that folder already contains Dayflit data; choose 'Use existing data' or pick an empty folder"));
                }
                copy_dir_recursive(&old, &new_dir, &["backups"])?;
                let _ = copy_dir_recursive(&old.join("backups"), &new_dir.join("backups"), &[]);
            }
            _ => return Err(anyhow!("unknown mode")),
        }
        *self.data_dir.write() = new_dir.clone();
        self.ensure_layout()?;
        self.write_config()?;
        if mode == "move" {
            let _ = fs::remove_dir_all(&old);
        }
        Ok(new_dir)
    }

    pub fn append_log(&self, line: &str) {
        let p = self.logs_dir().join("dayflit.log");
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&p) {
            let _ = writeln!(f, "{} {}", Utc::now().format("%Y-%m-%dT%H:%M:%SZ"), line);
        }
        if let Ok(m) = fs::metadata(&p) {
            if m.len() > 2_000_000 {
                let _ = fs::rename(&p, self.logs_dir().join("dayflit.log.1"));
            }
        }
    }
}

#[allow(dead_code)]
pub fn is_safe_attachment_filename(name: &str) -> bool {
    Store::is_safe_attachment_filename(name)
}

fn copy_dir_recursive(src: &Path, dst: &Path, skip: &[&str]) -> Result<()> {
    if !src.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(dst)?;
    for e in fs::read_dir(src)?.flatten() {
        let name = e.file_name();
        let n = name.to_string_lossy();
        if skip.contains(&n.as_ref()) || n.ends_with(".tmp") {
            continue;
        }
        let from = e.path();
        let to = dst.join(&name);
        if from.is_dir() {
            copy_dir_recursive(&from, &to, &[])?;
        } else {
            fs::copy(&from, &to).with_context(|| format!("copy {}", from.display()))?;
        }
    }
    Ok(())
}

/// Write bytes to `path` atomically: write tmp, fsync, replace. Retries handle transient
/// sharing violations from sync clients (OneDrive/Dropbox) and antivirus scanners.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!("{}.tmp", path.extension().and_then(|e| e.to_str()).unwrap_or("dat")));
    {
        let mut f = File::create(&tmp).with_context(|| format!("create {}", tmp.display()))?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    let mut last_err = None;
    for attempt in 0..8u64 {
        match fs::rename(&tmp, path) {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = Some(e);
                std::thread::sleep(Duration::from_millis(30 * (attempt + 1)));
            }
        }
    }
    fs::copy(&tmp, path).with_context(|| format!("replace {}: {:?}", path.display(), last_err))?;
    let _ = fs::remove_file(&tmp);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_safe_attachment_filename() {
        // Windows reserved DOS device names must all be rejected
        let reserved = ["CON.png", "prn.wav", "AUX.jpg", "nul.txt", "COM1.webp", "com9.mp3", "LPT1.pdf", "lpt9.md", "conin$.png", "conout$.wav"];
        for r in reserved {
            assert!(!is_safe_attachment_filename(r), "Reserved name {r} must be rejected");
        }

        // Path traversal and NTFS ADS
        let traversal = ["../photo.png", "..\\photo.png", "nested/../../photo.png", "photo.png:hidden", "C:\\autoexec.bat", "d:/secret.png"];
        for t in traversal {
            assert!(!is_safe_attachment_filename(t), "Traversal/ADS {t} must be rejected");
        }

        // Invalid Windows chars
        let invalid_chars = ["pic*.png", "pic?.png", "pic\"name.png", "pic<name.png", "pic>name.png", "pic|name.png"];
        for ic in invalid_chars {
            assert!(!is_safe_attachment_filename(ic), "Invalid char {ic} must be rejected");
        }

        // Trailing dots and spaces (NTFS auto-truncation issues)
        assert!(!is_safe_attachment_filename("image.png."));
        assert!(!is_safe_attachment_filename("image.png "));

        // Disallowed extensions
        let bad_exts = ["payload.exe", "script.bat", "run.cmd", "code.ps1", "lib.dll", "macro.vbs", "shell.sh"];
        for b in bad_exts {
            assert!(!is_safe_attachment_filename(b), "Bad extension {b} must be rejected");
        }

        // Allowed safe attachments
        let allowed = ["diagram-2026.png", "voice_memo.wav", "audio_track.mp3", "notes.md", "document.pdf", "photo.jpg", "sticker.webp"];
        for a in allowed {
            assert!(is_safe_attachment_filename(a), "Allowed attachment {a} should pass");
        }
    }

    #[test]
    fn test_store_image_path_safety() {
        let temp_base = std::env::temp_dir().join(format!("dayflit_test_store_{}", uuid::Uuid::new_v4()));
        let cfg_dir = temp_base.join("cfg");
        let data_dir = temp_base.join("data");
        let store = Store::new_with_dirs(cfg_dir.clone(), data_dir.clone()).expect("init test store");

        // Safe filename should resolve inside images_dir
        let safe_p = store.image_path("valid_photo.png").expect("safe path");
        assert_eq!(safe_p.parent(), Some(store.images_dir().as_path()));

        // Unsafe filenames must error
        assert!(store.image_path("CON.png").is_err());
        assert!(store.image_path("../evil.png").is_err());
        assert!(store.image_path("evil.png:ads").is_err());
        assert!(store.image_path("payload.exe").is_err());

        let _ = fs::remove_dir_all(&temp_base);
    }

    #[test]
    fn test_store_recovery_from_bak() {
        let temp_base = std::env::temp_dir().join(format!("dayflit_test_recovery_{}", uuid::Uuid::new_v4()));
        let cfg_dir = temp_base.join("cfg");
        let data_dir = temp_base.join("data");
        let store = Store::new_with_dirs(cfg_dir.clone(), data_dir.clone()).expect("init test store");

        // 1. Initial save of tasks
        let tasks_v1 = serde_json::json!([{"id": "t1", "title": "First Task"}]);
        store.save("tasks", tasks_v1.clone()).expect("first save");

        // 2. Second save creates .bak of v1
        let tasks_v2 = serde_json::json!([{"id": "t1", "title": "First Task"}, {"id": "t2", "title": "Second Task"}]);
        store.save("tasks", tasks_v2.clone()).expect("second save");

        // 3. Corrupt primary file with garbage bytes
        let primary_p = store.path_for("tasks");
        fs::write(&primary_p, b"corrupted byte stream payload").expect("corrupt primary");

        // 4. Load should detect corruption and recover from .bak
        let load_res = store.load("tasks").expect("load with recovery");
        assert_eq!(load_res.recovered_from.as_deref(), Some("bak"));
        let loaded_tasks = load_res.data.expect("recovered data");
        assert_eq!(loaded_tasks, tasks_v1);

        // Clean up
        let _ = fs::remove_dir_all(&temp_base);
    }
}

