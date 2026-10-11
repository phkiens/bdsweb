export const MASKED_PHONE = '••••••••••';
export const MASKED_NAME = '••••••';

export function maskOwnerPhone(phone: string | null | undefined, isLivestream: boolean): string {
  if (phone == null) return '';
  if (!isLivestream || phone.trim().length === 0) return phone;
  return MASKED_PHONE;
}

export function maskOwnerName(name: string | null | undefined, isLivestream: boolean): string {
  if (name == null) return '';
  if (!isLivestream || name.trim().length === 0) return name;
  return MASKED_NAME;
}
