import { Inject, Injectable } from '@nestjs/common';
import { or } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListMerchantsDto } from './dto/list-merchants.dto.js';
import type { MerchantAccountRow } from './merchants.types.js';

@Injectable()
export class MerchantsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPage(companyId: string, query: ListMerchantsDto): Promise<MerchantAccountRow[]> {
    const scoped = this.prisma.User.where({ companyId, role: 'MERCHANT' });
    const pattern = `%${(query.search ?? '').replace(/[\\%_]/g, '\\$&')}%`;
    const filtered = query.search
      ? scoped.where(user => or(user.fullName.ilike(pattern), user.email.ilike(pattern)))
      : scoped;
    return await filtered
      .select('id', 'fullName', 'email', 'isActive', 'isEmailVerified')
      .orderBy([user => user.fullName.asc(), user => user.id.asc()])
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize + 1)
      .all();
  }

  async findOne(companyId: string, id: string): Promise<MerchantAccountRow | null> {
    return this.prisma.User.where({ companyId, role: 'MERCHANT', id })
      .select('id', 'fullName', 'email', 'isActive', 'isEmailVerified')
      .first();
  }
}
