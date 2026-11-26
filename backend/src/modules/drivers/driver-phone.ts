import { BadRequestException } from '@nestjs/common';

/** BR-035: Palestinian local prefixes take precedence over the Israeli 05 form. */
export function normalizeDriverPhone(input: string): string {
  if (
    typeof input !== 'string' ||
    input.length > 40 ||
    !/^[+\d ()-]+$/.test(input)
  )
    throw new BadRequestException(
      'A valid Palestinian or Israeli mobile number is required',
    );
  let phone = input.replace(/[ ()-]/g, '');
  if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  if (/^05[69]\d{7}$/.test(phone)) phone = '+970' + phone.slice(1);
  else if (/^05\d{8}$/.test(phone)) phone = '+972' + phone.slice(1);
  if (!/^\+9705[69]\d{7}$/.test(phone) && !/^\+9725\d{8}$/.test(phone))
    throw new BadRequestException(
      'A valid Palestinian or Israeli mobile number is required',
    );
  return phone;
}
