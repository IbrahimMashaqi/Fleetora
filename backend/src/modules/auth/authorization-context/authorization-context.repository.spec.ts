import { beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from '@prisma/orm-postgres/runtime';
import { orm, type RuntimeQueryable } from '@prisma/orm-postgres/orm-client';
import { AsyncIterableResult } from '@prisma/orm-postgres/components/runtime';
import type { Contract } from '../../../prisma/generated/contract.d';
import contractJson from '../../../prisma/generated/contract.json' with { type: 'json' };
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthRepository } from '../auth.repository.js';
import { AuthorizationContextRepository } from './authorization-context.repository.js';

// Real ORM planning, with an empty execution sink. No driver or database access.
describe('authorization query boundaries (offline ORM)', () => {
  const plans: Parameters<RuntimeQueryable['execute']>[0][] = [];
  const runtime: RuntimeQueryable = {
    query<Row>(plan: Parameters<RuntimeQueryable['execute']>[0]) {
      plans.push(plan);
      return new AsyncIterableResult<Row>((async function* () {})());
    },
    async execute() {
      throw new Error('Writes are forbidden in offline query tests');
    },
  };
  const database = postgres<Contract>({ contractJson });
  const client = orm<Contract>({ context: database.context, runtime });
  const prisma = new PrismaService();
  vi.spyOn(prisma, 'User', 'get').mockReturnValue(client.public.User);
  const repository = new AuthorizationContextRepository(prisma);
  const legacy = new AuthRepository(prisma);

  beforeEach(() => {
    plans.length = 0;
  });

  it('queries persisted memberships and grants for the validated subject without credential fields', async () => {
    await expect(repository.findByUserId('user-1')).resolves.toBeNull();
    expect(plans).toHaveLength(1);
    const boundValues = plans[0].ast
      .collectParamRefs()
      .flatMap((parameter) =>
        parameter.kind === 'param-ref' ? [parameter.value] : [],
      );
    expect(boundValues).toContain('user-1');
    const query = JSON.stringify(plans[0].ast);
    expect(query).toContain('company_memberships');
    expect(query).toContain('platform_admin_grants');
    for (const field of ['password', 'refreshToken', 'verificationToken']) {
      expect(query).not.toContain(field);
    }
  });

  it('keeps existing authentication identity reads independent of undeployed authorization tables', async () => {
    await expect(legacy.findUserById('user-1')).resolves.toBeNull();
    const query = JSON.stringify(plans[0].ast);
    expect(query).toContain('password');
    expect(query).toContain('refreshToken');
    expect(query).not.toContain('company_memberships');
    expect(query).not.toContain('platform_admin_grants');
  });

  it('keeps existing public session reads on legacy User and Company fields', async () => {
    await expect(legacy.findSessionContextById('user-1')).resolves.toBeNull();
    const query = JSON.stringify(plans[0].ast);
    expect(query).toContain('companies');
    expect(query).toContain('companyId');
    expect(query).not.toContain('company_memberships');
    expect(query).not.toContain('platform_admin_grants');
    expect(query).not.toContain('password');
  });
});
