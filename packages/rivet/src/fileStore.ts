import { dbGet } from "./db";
import { EXT_FILES_STORE } from "./db";
import { guessMime } from "./crx";

async function readExtFile(extId: string, path: string): Promise<ArrayBuffer | null> {
  const key = `${extId}/${path.replace(/^\//, "")}`;
  const ab = await dbGet<ArrayBuffer>(EXT_FILES_STORE, key);
  return ab ?? null;
}

export async function readExtFileText(extId: string, path: string): Promise<string | null> {
  const ab = await readExtFile(extId, path);
  if (!ab) return null;
  return new TextDecoder().decode(ab);
}

export async function readExtFileURL(extId: string, path: string): Promise<string | null> {
  const ab = await readExtFile(extId, path);
  if (!ab) return null;
  const mime = guessMime(path);
  return URL.createObjectURL(new Blob([ab], { type: mime }));
}
