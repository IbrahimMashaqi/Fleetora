import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';
import { MerchantAccessService } from './merchant-access.service.js';
import type {
  MerchantContext,
  MerchantIdentity,
  MerchantPermission,
} from './merchant-access.types.js';

const PERMISSION_KEY = 'merchantPermission';
export const RequireMerchantPermission = (permission: MerchantPermission) =>
  SetMetadata(PERMISSION_KEY, permission);

@Injectable()
export class MerchantAccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(MerchantAccessService)
    private readonly access: MerchantAccessService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const permission = this.reflector.getAllAndOverride<MerchantPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<{
      user: MerchantIdentity;
      merchantContext?: MerchantContext;
    }>();
    request.merchantContext = await this.access.resolve(
      request.user,
      permission,
    );
    return true;
  }
}
