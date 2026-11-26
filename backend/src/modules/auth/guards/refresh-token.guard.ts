import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DRIVER_ENDPOINT } from '../decorators/driver-endpoint.decorator.js';
import { firstValueFrom, isObservable } from 'rxjs';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class RefreshTokenGuard extends AuthGuard('jwt-refresh') {
  constructor() {
    super();
  }
  override async canActivate(context: ExecutionContext) {
    const result = super.canActivate(context);
    const allowed = await (isObservable(result) ? firstValueFrom(result) : result);
    const user = context.switchToHttp().getRequest<{ user?: { role?: string } }>().user;
    const driverEndpoint = Reflect.getMetadata(DRIVER_ENDPOINT, context.getHandler()) || Reflect.getMetadata(DRIVER_ENDPOINT, context.getClass());
    if (user?.role === 'DRIVER' && !driverEndpoint) throw new ForbiddenException('Driver access is restricted to driver endpoints');
    return allowed;
  }
}
