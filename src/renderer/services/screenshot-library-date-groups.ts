import type { ScreenshotLibraryEntry } from "./screenshot-library-store";

export type ScreenshotDaySection = {
  dayKey: string;
  label: string;
  items: ScreenshotLibraryEntry[];
};

function localDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatSectionLabel(dayKey: string, now: Date): string {
  const todayKey = localDayKey(now.getTime());
  if (dayKey === todayKey) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dayKey === localDayKey(y.getTime())) return "Yesterday";

  const [ys, ms, ds] = dayKey.split("-").map(Number);
  if (!ys || !ms || !ds) return dayKey;
  const sectionDate = new Date(ys, ms - 1, ds);
  return sectionDate.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Group consecutive entries by local calendar day (newest-first list stays ordered).
 */
export function groupScreenshotLibraryByDay(
  entries: ScreenshotLibraryEntry[],
): ScreenshotDaySection[] {
  if (entries.length === 0) return [];
  const now = new Date();
  const out: ScreenshotDaySection[] = [];
  let currentKey: string | null = null;

  for (const it of entries) {
    const dayKey = localDayKey(it.takenAt);
    if (dayKey !== currentKey) {
      currentKey = dayKey;
      out.push({
        dayKey,
        label: formatSectionLabel(dayKey, now),
        items: [it],
      });
    } else {
      out[out.length - 1]!.items.push(it);
    }
  }
  return out;
}

export function formatScreenshotTileTime(takenAt: number): string {
  return new Date(takenAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
