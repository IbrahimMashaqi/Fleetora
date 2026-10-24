import postgres from '@prisma/orm-postgres/runtime';
import { orm, type RuntimeQueryable } from '@prisma/orm-postgres/orm-client';
import { AsyncIterableResult } from '@prisma/orm-postgres/components/runtime';
import { Test } from '@nestjs/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Contract } from '../../prisma/generated/contract.d';
import contractJson from '../../prisma/generated/contract.json' with { type: 'json' };
import { PrismaService } from '../prisma/prisma.service.js';
import { VehiclesRepository } from './vehicles.repository.js';

describe('vehicle query isolation (offline ORM plans, no database)', () => {
  const plans: Parameters<RuntimeQueryable['execute']>[0][] = [];
  const runtime: RuntimeQueryable = {
    query<Row>(plan: Parameters<RuntimeQueryable['execute']>[0]) {
      plans.push(plan);
      return new AsyncIterableResult<Row>((async function* () {})());
    },
    async execute() {
      throw new Error('Writes forbidden in offline driver tests');
    },
  };
  const context = postgres<Contract>({ contractJson }).context;
  const client = orm<Contract>({ context, runtime });
  let repository: VehiclesRepository;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        VehiclesRepository,
        {
          provide: PrismaService,
          useValue: { Vehicle: client.public.Vehicle },
        },
      ],
    }).compile();
    repository = module.get(VehiclesRepository);
  });
  beforeEach(() => {
    plans.length = 0;
  });

  function values() {
    return plans[0].ast
      .collectParamRefs()
      .flatMap((parameter) =>
        parameter.kind === 'param-ref' ? [parameter.value] : [],
      );
  }
  function assertPublicProjection() {
    const ast = JSON.stringify(plans[0].ast);
    expect(ast).toContain('companyId');
    for (const field of [
      'password',
      'refreshToken',
      'verificationToken',
      'company_memberships',
      'platform_admin_grants',
      'successRate',
      'location_events',
    ])
      expect(ast).not.toContain(field);
    expect(values().filter((value) => value === 'company-a')).toHaveLength(2);
    expect(ast).toContain('plateNumber');
    expect(ast).toContain('vehicles');
  }
  function whereClause() {
    const ast: unknown = JSON.parse(JSON.stringify(plans[0].ast));
    if (!ast || typeof ast !== 'object' || !('where' in ast)) {
      throw new Error('Driver reads must have an ownership predicate');
    }
    return JSON.stringify(ast.where);
  }
  it('scopes ordered bounded pages at the SQL boundary and binds escaped literal search', async () => {
    await expect(
      repository.list('company-a', {
        search: "A%_\\'",
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual([]);
    expect(plans).toHaveLength(1);
    assertPublicProjection();
    expect(whereClause()).toContain('manufacturer');
    expect(whereClause()).toContain('model');
    expect(whereClause()).toContain('companyId');
    expect(values()).toContain("%A\\%\\_\\\\'%");
    const ast: unknown = JSON.parse(JSON.stringify(plans[0].ast));
    expect(ast).toMatchObject({
      where: { kind: 'and' },
      limit: 11,
      offset: 10,
      orderBy: [
        { expr: { column: 'plateNumber' }, dir: 'asc' },
        { expr: { column: 'id' }, dir: 'asc' },
      ],
    });
  });
  it('preserves the company predicate when listing without search', async () => {
    await expect(
      repository.list('company-a', { page: 1, pageSize: 20 }),
    ).resolves.toEqual([]);
    assertPublicProjection();
    expect(whereClause()).toContain('companyId');
    expect(plans[0].ast).toMatchObject({ limit: 21, offset: 0 });
  });
  it('excludes assigned vehicles through an existence predicate', async () => {
    await repository.list('company-a', {
      page: 1,
      pageSize: 20,
      unassigned: true,
    });
    expect(JSON.stringify(plans[0].ast)).toContain('exists');
    assertPublicProjection();
  });
  it('keeps detail lookup constrained by company and requested ID', async () => {
    await expect(repository.find('company-a', 'driver-id')).resolves.toBeNull();
    assertPublicProjection();
    expect(values()).toContain('driver-id');
  });
});
