import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DRIVER_ENDPOINT } from '../decorators/driver-endpoint.decorator.js';
import type { TokenPayload } from '../token/token.payload.js';
import { firstValueFrom, isObservable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class AccessTokenGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const result = super.canActivate(context);
    const allowed = await (isObservable(result) ? firstValueFrom(result) : result);
    const request = context.switchToHttp().getRequest<{ user?: TokenPayload }>();
    if (request.user?.role === 'DRIVER' && !this.reflector.getAllAndOverride<boolean>(DRIVER_ENDPOINT, [context.getHandler(), context.getClass()]))
      throw new ForbiddenException('Driver access is restricted to driver endpoints');
    return allowed;
  }
}
