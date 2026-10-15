import { Inject, Injectable } from '@nestjs/common';
import { or } from '@prisma/orm-postgres/orm-client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListDriversDto } from './dto/list-drivers.dto.js';
import type { DriverRow } from './drivers.types.js';

@Injectable()
export class DriversRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPage(
    companyId: string,
    query: ListDriversDto,
  ): Promise<DriverRow[]> {
    const scoped = this.prisma.Worker.where({ companyId });
    const pattern = `%${(query.search ?? '').replace(/[\\%_]/g, '\\$&')}%`;
    const filtered = query.search
      ? scoped.where((worker) =>
          or(worker.fullName.ilike(pattern), worker.phone.ilike(pattern)),
        )
      : scoped;
    return await filtered
      .select('id', 'fullName', 'phone', 'status')
      .orderBy([(worker) => worker.fullName.asc(), (worker) => worker.id.asc()])
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize + 1)
      .all();
  }

  async findOne(companyId: string, id: string): Promise<DriverRow | null> {
    return this.prisma.Worker.where({ companyId, id })
      .select('id', 'fullName', 'phone', 'status')
      .first();
  }
}
