const numberFormat = new Intl.NumberFormat("en-US");

export function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return numberFormat.format(number);
}
