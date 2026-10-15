// Test-only preload: coordinate real CLI processes without production test hooks.
import { mock } from "bun:test";
import * as fs from "node:fs/promises";

const originalOpen = fs.open;
const gatedOpen = (async (...args: Parameters<typeof fs.open>) => {
  let handle;
  try {
    handle = await originalOpen(...args);
  } catch (cause) {
    if (String(args[0]).endsWith("/contexts.json.lock") &&
        typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EEXIST" &&
        process.env.CONTEXT_TEST_LOCK_PROGRESS) {
      await fs.writeFile(process.env.CONTEXT_TEST_LOCK_PROGRESS, "");
    }
    throw cause;
  }
  if (String(args[0]) === process.env.CONTEXT_TEST_GATE_FILE) {
    const originalRead = handle.readFile.bind(handle);
    handle.readFile = (async (...readArgs: Parameters<typeof handle.readFile>) => {
      const result = await originalRead(...readArgs);
      await fs.writeFile(process.env.CONTEXT_TEST_READY!, "");
      const deadline = performance.now() + 5000;
      while (!(await Bun.file(process.env.CONTEXT_TEST_RELEASE!).exists())) {
        if (performance.now() >= deadline) throw new Error("Timed out waiting to release CLI read.");
        await Bun.sleep(5);
      }
      return result;
    }) as typeof handle.readFile;
  }
  return handle;
}) as typeof fs.open;
mock.module("node:fs/promises", () => ({ ...fs, open: gatedOpen }));
