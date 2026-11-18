import { jsonFile } from "./json-file";
import { seedDesk } from "./seed";
import type { DeskFile } from "./types";

function assertDesk(value: unknown): DeskFile {
  if (!value || typeof value !== "object") throw new Error("Desk file is not an object");
  const desk = value as DeskFile;
  if (!desk.brand || !Array.isArray(desk.posts)) throw new Error("Desk file is missing the brand or the board");
  desk.runs ??= [];
  desk.holds ??= [];
  for (const hold of desk.holds) hold.status ??= "requested";
  return desk;
}

const store = jsonFile<DeskFile>("desk.json", seedDesk, assertDesk);

export function loadDesk(): Promise<DeskFile> {
  return store.load();
}

export async function updateDesk(mutate: (desk: DeskFile) => void | Promise<void>): Promise<DeskFile> {
  return (await store.update(mutate)).value;
}
