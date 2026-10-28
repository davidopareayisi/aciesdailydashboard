/** Accept Ghana local numbers and international numbers with common formatting. */
export function normalizeContactPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;

  let phone = trimmed.replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  else if (/^0\d{9}$/.test(phone)) phone = `+233${phone.slice(1)}`;
  else if (/^233\d{9}$/.test(phone)) phone = `+${phone}`;

  // Also accept the commonly written international trunk prefix: +233 (0)...
  if (/^\+2330\d{9}$/.test(phone)) phone = `+233${phone.slice(5)}`;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return null;
  if (phone.startsWith("+233") && !/^\+233[1-9]\d{8}$/.test(phone)) return null;
  return phone;
}
