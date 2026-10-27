import koffi from "koffi";

const user32 = koffi.load("user32.dll");
const mapVirtualKey = user32.func("uint32 __stdcall MapVirtualKeyW(uint32 code, uint32 map)");
const getAsyncKeyState = user32.func("int16 __stdcall GetAsyncKeyState(int key)");

export function scanOf(vk: number): number {
  if (vk <= 0) return 0;
  try {
    return Number(mapVirtualKey(vk, 0)) || 0;
  } catch (error) {
    console.error("macro input", error);
    return 0;
  }
}

export function keyDown(vk: number): boolean {
  try {
    return (Number(getAsyncKeyState(vk)) & 0x8000) !== 0;
  } catch (error) {
    console.error("macro input", error);
    return false;
  }
}
