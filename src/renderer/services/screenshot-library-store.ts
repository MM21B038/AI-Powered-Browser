const STORAGE_KEY = "orion_screenshot_library_v1";

export type ScreenshotCaptureMode = "viewport" | "fullpage" | "region" | "element" | "background";

export interface ScreenshotLibraryEntry {
  id: string;
  path: string;
  filename: string;
  takenAt: number;
  url: string;
  title: string;
  mode: ScreenshotCaptureMode;
  width?: number;
  height?: number;
}

function newId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function loadScreenshotLibrary(): ScreenshotLibraryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ScreenshotLibraryEntry =>
        e &&
        typeof e === "object" &&
        typeof (e as ScreenshotLibraryEntry).id === "string" &&
        typeof (e as ScreenshotLibraryEntry).path === "string" &&
        typeof (e as ScreenshotLibraryEntry).filename === "string" &&
        typeof (e as ScreenshotLibraryEntry).takenAt === "number",
    );
  } catch {
    return [];
  }
}

function persist(items: ScreenshotLibraryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

export function appendScreenshotLibraryEntry(
  partial: Omit<ScreenshotLibraryEntry, "id" | "takenAt"> & {
    id?: string;
    takenAt?: number;
  },
): ScreenshotLibraryEntry {
  const entry: ScreenshotLibraryEntry = {
    id: partial.id ?? newId(),
    path: partial.path,
    filename: partial.filename,
    takenAt: partial.takenAt ?? Date.now(),
    url: partial.url ?? "",
    title: partial.title ?? "",
    mode: partial.mode,
    width: partial.width,
    height: partial.height,
  };
  const next = [entry, ...loadScreenshotLibrary()];
  persist(next);
  return entry;
}

export function removeScreenshotLibraryEntriesByIds(ids: Set<string>): ScreenshotLibraryEntry[] {
  const kept = loadScreenshotLibrary().filter((e) => !ids.has(e.id));
  persist(kept);
  return kept;
}
