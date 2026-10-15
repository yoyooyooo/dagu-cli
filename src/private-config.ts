import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { CliError, configError } from "./errors.ts";

export const CONFIG_LIMIT = 65536;

export const isNodeError = (cause: unknown, code: string): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === code;

/** Open before checking permissions so the checked inode is the one we read. */
export const readPrivateFile = async (file: string): Promise<string | undefined> => {
  let handle;
  try {
    if ((await lstat(file)).isSymbolicLink()) throw configError("Dagu credential/config must not be a symlink.");
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    const uid = process.getuid?.();
    if (!info.isFile() || (uid !== undefined && info.uid !== uid) || (info.mode & 0o077) !== 0) {
      throw configError("Dagu credential/config must be an owner-private regular file (mode 600), not a symlink.");
    }
    if (info.size > CONFIG_LIMIT) throw configError("Dagu credential/config file is too large.");
    const text = await handle.readFile("utf8");
    if (Buffer.byteLength(text) > CONFIG_LIMIT) throw configError("Dagu credential/config file is too large.");
    return text;
  } catch (cause) {
    if (isNodeError(cause, "ENOENT")) return undefined;
    throw cause instanceof CliError ? cause : configError("Dagu credential/config file is unavailable; use a private regular file, not a symlink.");
  } finally {
    await handle?.close();
  }
};

export const parseConfigObject = (text: string): Record<string, unknown> => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw configError("Dagu config file is not JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw configError("Dagu config file must be a JSON object.");
  }
  return value as Record<string, unknown>;
};

export const nonEmpty = (value: string | undefined): string | undefined => value?.trim() || undefined;

export const validateBaseUrl = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw configError("Dagu base URL must be an absolute HTTP(S) URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw configError("Dagu base URL must be HTTP(S), without credentials, query, or fragment.");
  }
  if (url.pathname.replace(/\/+$/, "").endsWith("/mcp")) {
    throw configError("Dagu base URL must be the REST origin, not /mcp.");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
};
