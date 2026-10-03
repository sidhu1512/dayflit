export type VoiceDestination = "task" | "note" | "journal";

/** Light intent detection on a transcript: pick a destination and strip the trigger phrase. */
export function classifyVoice(raw: string, fallback: "ask" | VoiceDestination): { destination: VoiceDestination; text: string } {
  let text = raw.trim();
  const lower = text.toLowerCase();
  const rules: { re: RegExp; dest: VoiceDestination }[] = [
    { re: /^(?:hey (?:dayflit|sid)[,.]?\s*)?(?:remind me to|reminder to|remind me|add (?:a )?task(?: to)?|new task[:,]?|task[:,]|to do[:,]?|todo[:,]?|i need to|i have to|i should|don't forget to|dont forget to)\s+/i, dest: "task" },
    { re: /^(?:hey (?:dayflit|sid)[,.]?\s*)?(?:note to self[:,]?|note that|take a note[:,]?|new note[:,]?|note[:,])\s+/i, dest: "note" },
    { re: /^(?:hey (?:dayflit|sid)[,.]?\s*)?(?:journal[:,]?|dear diary[:,]?|journal entry[:,]?|today i|log that|diary[:,])\s+/i, dest: "journal" },
  ];
  for (const r of rules) {
    const m = lower.match(r.re);
    if (m) {
      text = text.slice(m[0].length).trim();
      if (r.dest === "journal" && m[0].toLowerCase().startsWith("today i")) text = "Today I " + text;
      return { destination: r.dest, text: polish(text) };
    }
  }
  // heuristics: short imperative phrases with dates read like tasks; long reflective text reads like journal
  const words = text.split(/\s+/).length;
  const looksTask = words <= 14 && /\b(tomorrow|today|tonight|next week|at \d|on monday|on tuesday|on wednesday|on thursday|on friday|on saturday|on sunday|call|email|buy|send|pay|book|schedule|finish|fix|ping|follow up)\b/i.test(text);
  const looksJournal = words > 40 || /\b(i felt|i feel|i think|i realised|i realized|grateful|today was|i learned)\b/i.test(text);
  const dest: VoiceDestination = fallback !== "ask" ? fallback : looksTask ? "task" : looksJournal ? "journal" : "note";
  return { destination: dest, text: polish(text) };
}

function polish(t: string): string {
  let s = t.trim().replace(/\s+/g, " ");
  if (!s) return s;
  s = s[0].toUpperCase() + s.slice(1);
  if (!/[.!?…]$/.test(s) && s.split(" ").length > 3) s += ".";
  return s;
}
