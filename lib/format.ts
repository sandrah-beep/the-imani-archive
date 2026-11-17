export function formatUGX(value: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency", currency: "UGX", maximumFractionDigits: 0
  }).format(value);
}
