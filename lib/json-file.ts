import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * A JSON file guarded by an in-process lock. Reads and writes queue behind each other,
 * and writes land atomically through a temp file.
 */
export function jsonFile<T>(name: string, seed: () => T | Promise<T>, check: (value: unknown) => T) {
  const file = path.join(process.cwd(), "data", name);
  let chain: Promise<unknown> = Promise.resolve();

  function locked<R>(fn: () => Promise<R>): Promise<R> {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function write(value: T) {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(tmp, file);
  }

  async function read(): Promise<T> {
    try {
      return check(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const value = await seed();
      await write(value);
      return value;
    }
  }

  return {
    load: () => locked(read),
    update: <R = void>(mutate: (value: T) => R | Promise<R>) =>
      locked(async () => {
        const value = await read();
        const result = await mutate(value);
        await write(value);
        return { value, result };
      }),
  };
}
