import koffi from "koffi";
import { versionValue } from "@shared/versionInfo";

const version = koffi.load("version.dll");
const versionSize = version.func(
  "uint32 __stdcall GetFileVersionInfoSizeW(str16 name, _Out_ uint32 *handle)",
);
const versionRead = version.func(
  "int __stdcall GetFileVersionInfoW(str16 name, uint32 handle, uint32 len, _Out_ uint8 *data)",
);

/** Product name baked into the executable, when the publisher filled it in. */
export function productName(imagePath: string | null): string | null {
  if (!imagePath || process.platform !== "win32") return null;
  try {
    const handle = [0];
    const bytes = versionSize(imagePath, handle) as number;
    if (!bytes || bytes > 1_000_000) return null;
    const data = Buffer.alloc(bytes);
    if (!versionRead(imagePath, 0, bytes, data)) return null;
    return versionValue(data, "ProductName") || versionValue(data, "FileDescription");
  } catch (error) {
    console.error("product name", imagePath, error);
    return null;
  }
}
