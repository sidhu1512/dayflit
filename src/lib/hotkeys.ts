/** In-window keyboard shortcut helpers. */

export function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** Build a normalized combo string like "ctrl+shift+k" from a keyboard event. */
export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (e.metaKey) parts.push("meta");
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (!["control", "alt", "shift", "meta"].includes(k)) parts.push(k === " " ? "space" : k);
  return parts.join("+");
}

/** Convert a KeyboardEvent to a Tauri accelerator string (e.g. "Ctrl+Shift+K"). */
export function acceleratorOf(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  const key = e.key;
  if (["Control", "Alt", "Shift", "Meta"].includes(key)) return null;
  let k = key;
  if (key === " ") k = "Space";
  else if (key.length === 1) k = key.toUpperCase();
  else if (/^F\d{1,2}$/.test(key)) k = key;
  else if (key === "ArrowUp") k = "Up";
  else if (key === "ArrowDown") k = "Down";
  else if (key === "ArrowLeft") k = "Left";
  else if (key === "ArrowRight") k = "Right";
  else if (key === "Escape") k = "Escape";
  else if (key === "Enter") k = "Enter";
  else if (key === "Backspace") k = "Backspace";
  else if (key === "Delete") k = "Delete";
  else if (key === "Tab") k = "Tab";
  else if (key === "Home" || key === "End" || key === "PageUp" || key === "PageDown" || key === "Insert") k = key;
  else return null;
  if (!mods.length && k.length === 1) return null; // require a modifier for single keys
  return [...mods, k].join("+");
}

export function prettyAccelerator(acc: string): string {
  return acc.replace("Super", "Win").replace("Ctrl", "Ctrl").split("+").join(" + ");
}
