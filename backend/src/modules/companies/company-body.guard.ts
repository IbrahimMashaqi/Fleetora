import {
  BadRequestException,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
const FIELDS = 'company-body-fields';
export const CompanyBody = (...fields: string[]) => SetMetadata(FIELDS, fields);
// Run before global validation can silently strip protected fields.
@Injectable()
export class CompanyBodyGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const fields = this.reflector.get<string[]>(FIELDS, context.getHandler());
    if (!fields) return true;
    const body: unknown = context
      .switchToHttp()
      .getRequest<{ body: unknown }>().body;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !fields.includes(key))
    )
      throw new BadRequestException(
        'Protected company fields are not writable',
      );
    return true;
  }
}
