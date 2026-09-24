/// <reference types="vite/client" />

import type { LumenApi } from "@shared/contracts";

declare global {
  interface Window {
    lumen: LumenApi;
  }
}

export {};
