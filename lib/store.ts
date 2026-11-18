import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { seedDesk } from "./seed";
import type { DeskFile } from "./types";

const file = path.join(process.cwd(), "data", "desk.json");

let chain: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function assertDesk(value: unknown): DeskFile {
  if (!value || typeof value !== "object") throw new Error("Desk file is not an object");
  const desk = value as DeskFile;
  if (!desk.brand || !Array.isArray(desk.posts)) throw new Error("Desk file is missing the brand or the board");
  desk.runs ??= [];
  desk.holds ??= [];
  return desk;
}

async function write(desk: DeskFile) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(desk, null, 2));
  await rename(tmp, file);
}

async function read(): Promise<DeskFile> {
  try {
    return assertDesk(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const desk = seedDesk();
    await write(desk);
    return desk;
  }
}

export function loadDesk(): Promise<DeskFile> {
  return locked(read);
}

export function updateDesk(mutate: (desk: DeskFile) => void | Promise<void>): Promise<DeskFile> {
  return locked(async () => {
    const desk = await read();
    await mutate(desk);
    await write(desk);
    return desk;
  });
}
