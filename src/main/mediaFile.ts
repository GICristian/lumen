import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { byteRangePlan, mediaContentType } from "@shared/byteRange";

function fileHeaders(extra: Record<string, string>): Record<string, string> {
  return {
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Range, Content-Length, Content-Type",
    ...extra,
  };
}

function fileStream(
  filePath: string,
  signal: AbortSignal | undefined,
  start?: number,
  end?: number,
): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath, { start, end });
  const stop = (): void => {
    nodeStream.destroy();
  };
  nodeStream.on("error", stop);
  if (signal) {
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
  }
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

export async function mediaFileResponse(
  filePath: string,
  rangeHeader: string | null,
  signal?: AbortSignal,
): Promise<Response> {
  let size = 0;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const type = mediaContentType(filePath);
  const plan = byteRangePlan(size, rangeHeader);
  if (plan.kind === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: fileHeaders({ "Content-Range": `bytes */${size}` }),
    });
  }

  if (plan.kind === "full") {
    return new Response(fileStream(filePath, signal), {
      status: 200,
      headers: fileHeaders({
        "Content-Type": type,
        "Content-Length": String(size),
      }),
    });
  }

  const length = plan.end - plan.start + 1;
  return new Response(fileStream(filePath, signal, plan.start, plan.end), {
    status: 206,
    headers: fileHeaders({
      "Content-Type": type,
      "Content-Length": String(length),
      "Content-Range": `bytes ${plan.start}-${plan.end}/${size}`,
    }),
  });
}
