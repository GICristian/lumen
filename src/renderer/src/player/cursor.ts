export function lumenCursor(size: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
    <defs><linearGradient id="gold" x1="5" y1="3" x2="22" y2="26" gradientUnits="userSpaceOnUse"><stop stop-color="#fff1d0"/><stop offset=".52" stop-color="#f0d08e"/><stop offset="1" stop-color="#c58f45"/></linearGradient></defs>
    <path d="M4 2.5 27 19.2 17.7 20.5 13 29.5 4 2.5Z" fill="url(#gold)" stroke="#19150f" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="m7.1 7.4 14.1 10.2-5.1.8-3 5.7L7.1 7.4Z" fill="#f6e5bf" fill-opacity=".46" stroke="#fff8e9" stroke-opacity=".72" stroke-width=".85" stroke-linejoin="round"/>
    <path d="m5.7 5 5.7 17.4" fill="none" stroke="#fff9eb" stroke-opacity=".9" stroke-width="1.15" stroke-linecap="round"/>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 3, auto`;
}
