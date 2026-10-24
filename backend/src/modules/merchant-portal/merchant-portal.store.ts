import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MerchantAccessService } from '../merchant-access/merchant-access.service.js';
import type {
  MerchantContext,
  MerchantPermission,
} from '../merchant-access/merchant-access.types.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import type { ParcelTransaction } from '../parcels/parcel-store.js';
@Injectable()
export class MerchantPortalStore {
  constructor(
    @Inject(PrismaService) readonly prisma: PrismaService,
    @Inject(MerchantAccessService) readonly access: MerchantAccessService,
  ) {}
  get orm() {
    return this.prisma.db.orm.public;
  }
  async write<T>(
    actor: TokenPayload,
    permission: MerchantPermission,
    operation: (tx: ParcelTransaction, context: MerchantContext) => Promise<T>,
  ) {
    const initial = await this.access.resolve(actor, permission);
    try {
      return await this.prisma.db.transaction(async (tx) => {
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT id FROM companies WHERE id=${initial.companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const context = await this.access.resolve(actor, permission, tx);
        if (
          context.companyId !== initial.companyId ||
          context.merchantId !== initial.merchantId
        )
          throw new ForbiddenException('Merchant context changed');
        return operation(tx, context);
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (
        error &&
        typeof error === 'object' &&
        (('sqlState' in error &&
          ['23505', '23503', '40001', '40P01'].includes(
            String(error.sqlState),
          )) ||
          ('code' in error &&
            ['23505', '23503', '40001', '40P01'].includes(String(error.code))))
      )
        throw new ConflictException(
          'Operation conflicts with another request; reload before retrying',
        );
      throw new InternalServerErrorException(
        'Operation could not be completed',
        { cause: error },
      );
    }
  }
  async idempotent(
    tx: ParcelTransaction,
    context: MerchantContext,
    key: string,
    action: string,
    input: object,
    effect: () => Promise<string>,
  ) {
    const scopedKey = `merchant:${context.userId}:${key}`;
    const payloadHash = createHash('sha256')
      .update(JSON.stringify({ action, input }))
      .digest('hex');
    const previous = await tx.orm.public.MonetaryRequest.where({
      companyId: context.companyId,
      key: scopedKey,
    }).first();
    if (previous) {
      if (previous.payloadHash !== payloadHash)
        throw new ConflictException(
          'Idempotency key belongs to a different request',
        );
      return previous.resultId;
    }
    const resultId = await effect();
    await tx.orm.public.MonetaryRequest.create({
      companyId: context.companyId,
      key: scopedKey,
      payloadHash,
      resultId,
    });
    return resultId;
  }
}
