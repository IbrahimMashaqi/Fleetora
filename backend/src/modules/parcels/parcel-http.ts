import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
export const parcelValidation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
export function expectedCompany(
  actor: TokenPayload,
  expected: string | undefined,
) {
  if (!expected || expected !== actor.orgId)
    throw new ForbiddenException('Session context changed');
}
