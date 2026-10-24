import postgres from '@prisma/orm-postgres/runtime';
import { orm, type RuntimeQueryable } from '@prisma/orm-postgres/orm-client';
import { AsyncIterableResult } from '@prisma/orm-postgres/components/runtime';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Contract } from '../../prisma/generated/contract.d';
import contractJson from '../../prisma/generated/contract.json' with { type: 'json' };
import { PrismaService } from '../prisma/prisma.service.js';
import { ParcelStore } from './parcel-store.js';
import { ParcelLedger } from './parcel-ledger.js';
import { ParcelOperationsRepository } from './parcel-operations.repository.js';
import { ParcelFinanceRepository } from './parcel-finance.repository.js';
import { ParcelDashboardRepository } from './parcel-dashboard.repository.js';
import { PageDto } from './parcel.dto.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
describe('parcel SQL tenant boundaries (offline, no database)', () => {
  const plans: Parameters<RuntimeQueryable['execute']>[0][] = [];
  const runtime: RuntimeQueryable = {
    query<Row>(plan: Parameters<RuntimeQueryable['execute']>[0]) {
      plans.push(plan);
      return new AsyncIterableResult<Row>((async function* () {})());
    },
    async execute() {
      throw new Error('Offline reads must not write');
    },
  };
  const base = postgres<Contract>({ contractJson });
  const client = orm<Contract>({ context: base.context, runtime });
  const actor: TokenPayload = {
    sub: 'fixture-actor',
    orgId: 'fixture-company',
    role: 'ACCOUNTANT',
    email: 'fixture@example.invalid',
  };
  let ops: ParcelOperationsRepository,
    finance: ParcelFinanceRepository,
    dashboard: ParcelDashboardRepository;
  beforeEach(async () => {
    plans.length = 0;
    const module = await Test.createTestingModule({
      providers: [
        ParcelStore,
        ParcelLedger,
        ParcelOperationsRepository,
        ParcelFinanceRepository,
        ParcelDashboardRepository,
        {
          provide: PrismaService,
          useValue: {
            db: { orm: client, raw: base.raw, runtime: () => runtime },
          },
        },
      ],
    }).compile();
    ops = module.get(ParcelOperationsRepository);
    finance = module.get(ParcelFinanceRepository);
    dashboard = module.get(ParcelDashboardRepository);
  });
  const serialized = () => JSON.stringify(plans.map((plan) => plan.ast));
  const values = () =>
    plans.flatMap((plan) =>
      plan.ast
        .collectParamRefs()
        .flatMap((p) => (p.kind === 'param-ref' ? [p.value] : [])),
    );
  function scopedAndSafe() {
    expect(values()).toContain(actor.orgId);
    for (const name of [
      'password',
      'refreshToken',
      'verificationToken',
      'platform_admin_grants',
      'company_memberships',
    ])
      expect(serialized()).not.toContain(name);
  }
  it('binds merchant tenant, literal search, active filter and bounded pagination', async () => {
    const query = Object.assign(new PageDto(), {
      page: 3,
      pageSize: 10,
      search: '%_\\',
      active: true,
    });
    expect((await ops.merchants(actor, query)).items).toEqual([]);
    scopedAndSafe();
    expect(values()).toContain('%\\%\\_\\\\%');
    expect(plans[0].ast).toMatchObject({ limit: 11, offset: 20 });
  });
  it('keeps driver options safe for accountant access', async () => {
    await ops.drivers(
      actor,
      Object.assign(new PageDto(), { search: 'Driver' }),
    );
    scopedAndSafe();
    expect(serialized()).toContain('fullName');
    expect(serialized()).not.toContain('location_events');
    expect(plans[0].ast).toMatchObject({ limit: 26 });
  });
  it('applies parcel merchant/driver/city/status/date filters with escaped search at SQL boundary', async () => {
    await ops.parcels(
      actor,
      Object.assign(new PageDto(), {
        merchantId: 'merchant-a',
        workerId: 'driver-a',
        city: 'City',
        status: 'DELIVERED',
        search: '100%',
        from: '2026-01-01T00:00:00Z',
        to: '2026-12-31T23:59:59Z',
      }),
    );
    scopedAndSafe();
    for (const value of [
      'merchant-a',
      'driver-a',
      'City',
      'DELIVERED',
      '%100\\%%',
    ])
      expect(values()).toContain(value);
    expect(serialized()).toContain('createdAt');
  });
  it('scopes return relation lookup and enforces reason and stage filters', async () => {
    await ops.returns(
      actor,
      Object.assign(new PageDto(), {
        merchantId: 'merchant-a',
        status: 'RETURN_IN_PROGRESS',
        reason: 'ATTEMPTS_EXHAUSTED',
      }),
    );
    scopedAndSafe();
    expect(values()).toContain('ATTEMPTS_EXHAUSTED');
    expect(values().filter((v) => v === actor.orgId).length).toBeGreaterThan(1);
    expect(plans[0].ast).toMatchObject({ limit: 26 });
  });
  it.each([true, false])(
    'filters remittance existence %s without treating collection as remittance',
    async (remitted) => {
      await finance.collections(
        actor,
        Object.assign(new PageDto(), { remitted, merchantId: 'merchant-a' }),
      );
      scopedAndSafe();
      expect(serialized()).toContain('cash_remittances');
      expect(plans[0].ast).toMatchObject({ limit: 26 });
    },
  );
  it('scopes settlement listing by merchant/currency/state with stable bounded sort', async () => {
    await finance.settlements(
      actor,
      Object.assign(new PageDto(), {
        merchantId: 'merchant-a',
        currency: 'JOD',
        status: 'PAID',
      }),
    );
    scopedAndSafe();
    for (const value of ['merchant-a', 'JOD', 'PAID'])
      expect(values()).toContain(value);
    expect(plans[0].ast).toMatchObject({ limit: 26 });
  });
  it('scopes every dashboard query and keeps all activity/attention lists bounded', async () => {
    expect((await dashboard.dashboard(actor)).counts.total).toBe(0);
    expect(plans).toHaveLength(6);
    for (const plan of plans) {
      expect(
        plan.ast
          .collectParamRefs()
          .some((p) => p.kind === 'param-ref' && p.value === actor.orgId),
      ).toBe(true);
    }
    scopedAndSafe();
    expect(
      plans.filter((p) => 'limit' in p.ast && p.ast.limit === 20),
    ).toHaveLength(3);
  });
  it.each(['MERCHANT', 'PLATFORM_ADMIN'] as const)(
    'rejects unauthorized %s before issuing SQL',
    async (role) => {
      await expect(
        ops.parcels({ ...actor, role }, new PageDto()),
      ).rejects.toMatchObject({ status: 403 });
      expect(plans).toHaveLength(0);
    },
  );
  it('returns scoped absence without loading any account or foreign tenant data', async () => {
    await expect(ops.details(actor, 'foreign-parcel')).rejects.toMatchObject({
      status: 404,
    });
    scopedAndSafe();
    expect(plans).toHaveLength(1);
  });
});
