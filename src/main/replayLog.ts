import { app } from "electron";
import { appendFileSync } from "node:fs";
import path from "node:path";

/** Appends one capture-start line. Failures here must not affect recording. */
export function replayLog(scope: string, detail?: unknown): void {
  const text = detail === undefined
    ? ""
    : ` ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  const line = `${new Date().toISOString()} ${scope}${text}\n`;
  try {
    appendFileSync(path.join(app.getPath("userData"), "replay-debug.log"), line);
  } catch {
    // The log is diagnostic. Capture still has to run when the disk is busy.
  }
}
