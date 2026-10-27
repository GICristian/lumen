export type KeyCap = {
  label: string;
  vk: number;
  mouse: string;
  grow: number;
};

function key(label: string, vk: number, grow = 1): KeyCap {
  return { label, vk, mouse: "", grow };
}

function mouse(label: string, code: string, grow = 1.5): KeyCap {
  return { label, vk: 0, mouse: code, grow };
}

function letters(text: string): KeyCap[] {
  return [...text].map((letter) => key(letter, letter.charCodeAt(0)));
}

const fn: KeyCap[] = [key("Esc", 0x1b)];
for (let index = 0; index < 12; index += 1) {
  if (index === 4 || index === 8) fn.push(key("", 0, 0.4));
  fn.push(key(`F${index + 1}`, 0x70 + index));
}

/** The deck the editor draws. Gaps are empty caps with vk 0. */
export const KEY_ROWS: KeyCap[][] = [
  fn,
  [
    key("`", 0xc0),
    ...letters("1234567890"),
    key("-", 0xbd),
    key("=", 0xbb),
    key("Back", 0x08, 2),
  ],
  [
    key("Tab", 0x09, 1.5),
    ...letters("QWERTYUIOP"),
    key("[", 0xdb),
    key("]", 0xdd),
    key("\\", 0xdc, 1.5),
  ],
  [
    key("Caps", 0x14, 1.75),
    ...letters("ASDFGHJKL"),
    key(";", 0xba),
    key("'", 0xde),
    key("Enter", 0x0d, 2.25),
  ],
  [
    key("Shift", 0xa0, 2.25),
    ...letters("ZXCVBNM"),
    key(",", 0xbc),
    key(".", 0xbe),
    key("/", 0xbf),
    key("Shift", 0xa1, 2.75),
  ],
  [
    key("Ctrl", 0xa2, 1.25),
    key("Win", 0x5b, 1.25),
    key("Alt", 0xa4, 1.25),
    key("Space", 0x20, 6.25),
    key("Alt", 0xa5, 1.25),
    key("Ctrl", 0xa3, 1.5),
  ],
];

export const KEY_SIDE: KeyCap[][] = [
  [key("Ins", 0x2d), key("Home", 0x24), key("PgUp", 0x21)],
  [key("Del", 0x2e), key("End", 0x23), key("PgDn", 0x22)],
  [key("", 0), key("Up", 0x26), key("", 0)],
  [key("Left", 0x25), key("Down", 0x28), key("Right", 0x27)],
];

export const KEY_MOUSE: KeyCap[] = [
  mouse("Left", "left"),
  mouse("Right", "right"),
  mouse("Middle", "middle"),
  mouse("Mouse 4", "x1", 1.2),
  mouse("Mouse 5", "x2", 1.2),
];
