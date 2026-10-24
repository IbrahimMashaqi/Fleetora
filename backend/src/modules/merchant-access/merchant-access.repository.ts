import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type MerchantTransaction = Parameters<
  Parameters<PrismaService['db']['transaction']>[0]
>[0];
export type MerchantOrm = MerchantTransaction['orm']['public'];

@Injectable()
export class MerchantAccessRepository {
  constructor(@Inject(PrismaService) readonly prisma: PrismaService) {}
  get orm() {
    return this.prisma.db.orm.public;
  }

  async transaction<T>(
    companyId: string,
    operation: (tx: MerchantTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.db.transaction(async (tx) => {
        await tx.execute(
          this.prisma.db.raw
            .sql`SELECT "id" FROM "companies" WHERE "id"=${companyId} FOR UPDATE`
            .affectedCount()
            .build(),
        );
        const company = await tx.orm.public.Company.where({
          id: companyId,
        }).first();
        if (!company || company.suspended) throw new UnauthorizedException();
        return operation(tx);
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      if (
        error &&
        typeof error === 'object' &&
        (('code' in error &&
          ['23505', '23503', '40001', '40P01', 'P2002', 'P2003'].includes(
            String(error.code),
          )) ||
          ('sqlState' in error &&
            ['23505', '23503', '40001', '40P01'].includes(
              String(error.sqlState),
            )))
      ) {
        throw new ConflictException(
          'Membership or invitation changed; retry the operation',
        );
      }
      throw new InternalServerErrorException(
        'Merchant access operation could not be completed',
        { cause: error },
      );
    }
  }

  async lockUser(tx: MerchantTransaction, userId: string) {
    await tx.execute(
      this.prisma.db.raw
        .sql`SELECT "id" FROM "users" WHERE "id"=${userId} FOR UPDATE`
        .affectedCount()
        .build(),
    );
  }
  async lockMembership(tx: MerchantTransaction, userId: string) {
    await tx.execute(
      this.prisma.db.raw
        .sql`SELECT "id" FROM "merchant_memberships" WHERE "userId"=${userId} FOR UPDATE`
        .affectedCount()
        .build(),
    );
  }
  async lockMerchant(
    tx: MerchantTransaction,
    merchantId: string,
    companyId: string,
  ) {
    await tx.execute(
      this.prisma.db.raw
        .sql`SELECT "id" FROM "merchants" WHERE "id"=${merchantId} AND "companyId"=${companyId} FOR UPDATE`
        .affectedCount()
        .build(),
    );
  }
  async lockInvitation(tx: MerchantTransaction, id: string, companyId: string) {
    await tx.execute(
      this.prisma.db.raw
        .sql`SELECT "id" FROM "merchant_invitations" WHERE "id"=${id} AND "companyId"=${companyId} FOR UPDATE`
        .affectedCount()
        .build(),
    );
  }
  async audit(
    tx: MerchantTransaction,
    companyId: string,
    merchantId: string,
    actorId: string,
    action: string,
    details: Record<string, string | string[] | boolean | null>,
  ) {
    await tx.orm.public.MerchantAccessEvent.create({
      companyId,
      merchantId,
      actorId,
      action,
      details,
    });
  }
}
