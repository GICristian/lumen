/** Preferred column count; narrow windows collapse without shrinking the controls. */
export function galleryColumns(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 6 ? number : 3;
}
