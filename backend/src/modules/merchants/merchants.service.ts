import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { MerchantsRepository } from './merchants.repository.js';
import type { ListMerchantsDto } from './dto/list-merchants.dto.js';
import type { MerchantAccount, MerchantAccountRow, MerchantDetails, MerchantPage } from './merchants.types.js';

@Injectable()
export class MerchantsService {
  constructor(@Inject(MerchantsRepository) private readonly repository: MerchantsRepository) {}

  private companyId(actor: TokenPayload | undefined): string {
    if (!actor?.sub) throw new UnauthorizedException();
    if (actor.role !== 'COMPANY_ADMIN' || typeof actor.orgId !== 'string' || !actor.orgId.trim()) {
      throw new ForbiddenException('Company administrator access required');
    }
    return actor.orgId;
  }

  private publicAccount(row: MerchantAccountRow): MerchantAccount {
    return { id: row.id, name: row.fullName, email: row.email, isActive: row.isActive, isEmailVerified: row.isEmailVerified };
  }

  async list(actor: TokenPayload, query: ListMerchantsDto): Promise<MerchantPage> {
    const companyId = this.companyId(actor);
    const rows = await this.repository.findPage(companyId, query);
    return { companyId, items: rows.slice(0, query.pageSize).map(row => this.publicAccount(row)), page: query.page, pageSize: query.pageSize, hasNext: rows.length > query.pageSize };
  }

  async details(actor: TokenPayload, id: string): Promise<MerchantDetails> {
    const companyId = this.companyId(actor);
    const row = await this.repository.findOne(companyId, id);
    if (!row) throw new NotFoundException('Merchant account not found');
    return { companyId, account: this.publicAccount(row) };
  }
}
