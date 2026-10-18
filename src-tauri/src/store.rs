//! Local persistence: one human-readable JSON file, written atomically,
//! with the previous version kept as `.bak`. Rust is the only writer.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Suggestion {
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub vault_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Thought {
    pub id: String,
    pub text: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub vault_id: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub suggestion: Option<Suggestion>,
    #[serde(default)]
    pub archived: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Vault {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Settings {
    pub shortcut: String,
    pub buddy: String,
    pub launch_at_login: bool,
    pub desk_pet: bool,
    pub auto_suggest: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            shortcut: "Ctrl+Shift+Space".into(),
            buddy: "pip".into(),
            launch_at_login: false,
            desk_pet: true,
            auto_suggest: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct State {
    pub version: u32,
    pub thoughts: Vec<Thought>,
    pub vaults: Vec<Vault>,
    pub settings: Settings,
}

pub struct Store {
    pub path: PathBuf,
    pub state: State,
    pub first_run: bool,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Short, sortable, collision-safe-enough ids for a single-user local file.
pub fn new_id() -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    static SEQ: AtomicU32 = AtomicU32::new(0);
    let n = SEQ.fetch_add(1, Ordering::Relaxed) & 0xfff;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("{:x}{:03x}{:05x}", now_ms(), n, nanos & 0xfffff)
}

fn read(path: &Path) -> Option<State> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

impl Store {
    /// Open the data file. `legacy` is where an older version kept it; if the
    /// new place is empty, the old files are copied over (never deleted).
    pub fn open(dir: &Path, legacy: Option<&Path>) -> Self {
        let _ = fs::create_dir_all(dir);
        let path = dir.join("thoughts.json");
        if let Some(old) = legacy {
            if !path.exists() && old.join("thoughts.json").exists() {
                for f in ["thoughts.json", "thoughts.json.bak"] {
                    let _ = fs::copy(old.join(f), dir.join(f));
                }
            }
        }
        let bak = path.with_extension("json.bak");
        let first_run = !path.exists() && !bak.exists();
        let state = match read(&path) {
            Some(s) => s,
            None if path.exists() => {
                // keep the unreadable file for recovery, fall back to the backup
                let _ = fs::rename(
                    &path,
                    path.with_extension(format!("corrupt-{}.json", now_ms())),
                );
                read(&bak).unwrap_or_default()
            }
            None => read(&bak).unwrap_or_default(),
        };
        Self {
            path,
            state,
            first_run,
        }
    }

    /// write tmp → fsync → keep previous as .bak → atomic rename over the original
    pub fn save(&mut self) -> Result<(), String> {
        self.state.version = 1;
        let json = serde_json::to_vec_pretty(&self.state).map_err(|e| e.to_string())?;
        let tmp = self.path.with_extension("json.tmp");
        {
            let mut f = fs::File::create(&tmp).map_err(|e| format!("couldn't write: {e}"))?;
            f.write_all(&json)
                .map_err(|e| format!("couldn't write: {e}"))?;
            f.sync_all().map_err(|e| format!("couldn't flush: {e}"))?;
        }
        if self.path.exists() {
            let _ = fs::copy(&self.path, self.path.with_extension("json.bak"));
        }
        // Windows refuses the swap while anything (antivirus, indexer, a backup
        // tool) has the file open, so retry briefly, then write in place.
        let mut last = None;
        for attempt in 0..12 {
            match fs::rename(&tmp, &self.path) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    last = Some(e);
                    std::thread::sleep(std::time::Duration::from_millis(10 + attempt * 10));
                }
            }
        }
        let _ = fs::remove_file(&tmp);
        fs::write(&self.path, &json).map_err(|e| {
            format!(
                "couldn't save ({}; then {e})",
                last.map(|x| x.to_string()).unwrap_or_default()
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// A fresh, empty folder for one test.
    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("tuck-test-{name}-{}", new_id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn thought(text: &str) -> Thought {
        Thought {
            id: new_id(),
            text: text.into(),
            created_at: now_ms(),
            updated_at: now_ms(),
            vault_id: None,
            category: None,
            tags: vec![],
            suggestion: None,
            archived: false,
        }
    }

    #[test]
    fn empty_folder_is_a_first_run() {
        let d = temp_dir("first");
        let s = Store::open(&d, None);
        assert!(s.first_run);
        assert!(s.state.thoughts.is_empty());
        assert_eq!(s.state.settings.shortcut, "Ctrl+Shift+Space");
    }

    #[test]
    fn saved_thoughts_come_back_and_no_temp_file_is_left() {
        let d = temp_dir("roundtrip");
        let mut s = Store::open(&d, None);
        s.state.thoughts.push(thought("call the dentist"));
        s.save().unwrap();
        s.state.thoughts.push(thought("recap module 5"));
        s.save().unwrap();

        let again = Store::open(&d, None);
        assert!(!again.first_run);
        assert_eq!(again.state.thoughts.len(), 2);
        assert!(!d.join("thoughts.json.tmp").exists());
        // the previous version is kept as a backup
        let bak: State =
            serde_json::from_str(&fs::read_to_string(d.join("thoughts.json.bak")).unwrap())
                .unwrap();
        assert_eq!(bak.thoughts.len(), 1);
    }

    #[test]
    fn a_broken_file_falls_back_to_the_backup_and_is_kept_aside() {
        let d = temp_dir("corrupt");
        let mut s = Store::open(&d, None);
        s.state.thoughts.push(thought("keep me"));
        s.save().unwrap();
        s.save().unwrap(); // now the .bak has "keep me" too
        fs::write(d.join("thoughts.json"), "{ not json").unwrap();

        let recovered = Store::open(&d, None);
        assert_eq!(recovered.state.thoughts.len(), 1);
        assert_eq!(recovered.state.thoughts[0].text, "keep me");
        let kept = fs::read_dir(&d)
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().contains("corrupt-"));
        assert!(kept, "the unreadable file should be kept for recovery");
    }

    #[test]
    fn old_data_is_copied_from_the_previous_app_folder() {
        let old = temp_dir("legacy-old");
        let mut s = Store::open(&old, None);
        s.state.thoughts.push(thought("from before the rename"));
        s.save().unwrap();

        let new = temp_dir("legacy-new");
        let moved = Store::open(&new, Some(&old));
        assert_eq!(moved.state.thoughts.len(), 1);
        assert!(
            old.join("thoughts.json").exists(),
            "the old folder is never deleted"
        );
    }

    #[test]
    fn existing_data_is_never_overwritten_by_old_data() {
        let old = temp_dir("legacy-old2");
        let mut o = Store::open(&old, None);
        o.state.thoughts.push(thought("old"));
        o.save().unwrap();

        let new = temp_dir("legacy-new2");
        let mut n = Store::open(&new, None);
        n.state.thoughts.push(thought("new one"));
        n.state.thoughts.push(thought("new two"));
        n.save().unwrap();

        let opened = Store::open(&new, Some(&old));
        assert_eq!(opened.state.thoughts.len(), 2);
    }

    #[test]
    fn files_from_older_versions_load_with_defaults() {
        let d = temp_dir("defaults");
        // an old file: no version, missing settings fields, thought without tags
        fs::write(
            d.join("thoughts.json"),
            r#"{"thoughts":[{"id":"a","text":"hi","created_at":1,"updated_at":1,"vault_id":null}],"settings":{"buddy":"miso"}}"#,
        )
        .unwrap();
        let s = Store::open(&d, None);
        assert_eq!(s.state.thoughts[0].tags.len(), 0);
        assert!(!s.state.thoughts[0].archived);
        assert_eq!(s.state.settings.buddy, "miso");
        assert!(s.state.settings.desk_pet);
    }

    #[test]
    fn ids_are_unique() {
        let ids: std::collections::HashSet<String> = (0..5000).map(|_| new_id()).collect();
        assert_eq!(ids.len(), 5000);
    }
}
