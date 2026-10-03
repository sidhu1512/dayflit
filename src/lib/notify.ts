import { ipc, isTauri } from "./ipc";
import { useSettings } from "@/stores/settings";

let permissionChecked = false;
let quietState = "accepts";

export function setQuietState(s: string) {
  quietState = s;
}

export function quietHoursActive(): boolean {
  return ["busy", "presentation", "fullscreen", "quiet_time"].includes(quietState);
}

export async function notify(title: string, body?: string, opts: { force?: boolean } = {}) {
  const s = useSettings.getState().settings;
  if (!s.notifications.enabled && !opts.force) return;
  if (s.notifications.respectQuietHours && quietHoursActive() && !opts.force) return;
  if (!isTauri) {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
    return;
  }
  try {
    const n = await import("@tauri-apps/plugin-notification");
    if (!permissionChecked) {
      let granted = await n.isPermissionGranted();
      if (!granted) granted = (await n.requestPermission()) === "granted";
      permissionChecked = true;
      if (!granted) return;
    }
    n.sendNotification({ title, body });
  } catch (e) {
    void ipc.log(`notify failed: ${String(e)}`);
  }
}
