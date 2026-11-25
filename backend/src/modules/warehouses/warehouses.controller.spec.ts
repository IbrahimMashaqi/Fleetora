import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  NotFoundException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AccessTokenStrategy } from '../auth/strategies/access-token.strategy.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from '../../common/exceptions-filter/http-exception.filter.js';
import type { UserRole } from '../auth/token/token.payload.js';
import { WarehousesModule } from './warehouses.module.js';
import { WarehousesRepository } from './warehouses.repository.js';
import type { ListWarehousesDto } from './dto/list-warehouses.dto.js';

const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const hubId = '33333333-3333-4333-8333-333333333333';
const otherId = '44444444-4444-4444-8444-444444444444';
const rows = [
  {
    id: hubId,
    companyId: companyA,
    name: 'Main Hub',
    address: 'Fictional industrial zone 4',
    archivedAt: null,
    createdAt: 'fixture-private',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    companyId: companyA,
    name: 'Old Annex',
    address: 'Fictional side street 7',
    archivedAt: '2026-11-01T00:00:00Z',
  },
  {
    id: otherId,
    companyId: companyB,
    name: 'Other Company Hub',
    address: 'Fictional foreign road 9',
    archivedAt: null,
  },
];

// Real Nest HTTP pipeline, JWT validation, persisted-identity strategy, DTOs and
// service. Persistence is an in-memory fixture; database behaviour is covered by
// test/warehouses.auth-integration.spec.ts.
describe('Company Admin warehouses API (isolated fixtures)', () => {
  let app: INestApplication<App>;
  let actor: {
    id: string;
    email: string;
    role: UserRole;
    companyId: string | null;
    isActive: boolean;
    isEmailVerified: boolean;
  };
  const findUserById = vi.fn();
  const isCompanyActiveForUser = vi.fn();
  const findPage = vi.fn();
  const findOne = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const setArchived = vi.fn();
  const secret = 'isolated-warehouse-api-test-secret';
  const jwt = new JwtService({ secret });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [WarehousesModule],
      providers: [
        AccessTokenStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({ ACCESS_TOKEN_SECRET: secret }),
        },
        {
          provide: AuthRepository,
          useValue: { findUserById, isCompanyActiveForUser },
        },
      ],
    })
      .overrideProvider(WarehousesRepository)
      .useValue({ findPage, findOne, create, update, setArchived })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    actor = {
      id: '77777777-7777-4777-8777-777777777777',
      email: 'admin@example.invalid',
      role: 'COMPANY_ADMIN',
      companyId: companyA,
      isActive: true,
      isEmailVerified: true,
    };
    findUserById.mockImplementation(async (id: string) =>
      id === actor.id ? actor : null,
    );
    isCompanyActiveForUser.mockResolvedValue(true);
    findPage.mockImplementation(
      async (companyId: string, query: ListWarehousesDto) =>
        rows
          .filter((row) => row.companyId === companyId)
          .filter((row) =>
            query.status === 'ARCHIVED' ? row.archivedAt : !row.archivedAt,
          )
          .slice(0, query.pageSize + 1),
    );
    findOne.mockImplementation(
      async (companyId: string, id: string) =>
        rows.find((row) => row.companyId === companyId && row.id === id) ??
        null,
    );
    create.mockResolvedValue(hubId);
    update.mockResolvedValue(undefined);
    setArchived.mockResolvedValue(undefined);
  });
  afterAll(async () => {
    await app?.close();
  });

  function token(claims: Record<string, unknown> = {}) {
    return jwt.sign(
      {
        sub: actor.id,
        email: actor.email,
        role: actor.role,
        orgId: actor.companyId ?? '',
        typ: 'access',
        ...claims,
      },
      { expiresIn: '5m' },
    );
  }
  function get(path = '/warehouses', bearer = token()) {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${bearer}`);
  }
  function write(
    method: 'post' | 'patch' | 'put',
    path: string,
    body: Record<string, unknown>,
    context: string | null = companyA,
  ) {
    const call = request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${token()}`);
    if (context) call.set('X-Fleetora-Company-Context', context);
    return call.send(body);
  }
  const valid = { name: 'North Depot', address: 'Fictional north road 2' };

  it('lists own active warehouses by default with only public fields', async () => {
    const response = await get().expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.data).toEqual({
      companyId: companyA,
      items: [
        {
          id: hubId,
          name: 'Main Hub',
          address: 'Fictional industrial zone 4',
          archived: false,
        },
      ],
      page: 1,
      pageSize: 20,
      hasNext: false,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /fixture-private|Other Company Hub|companyId":"2222/,
    );
    expect(findPage).toHaveBeenCalledWith(
      companyA,
      expect.objectContaining({ status: 'ACTIVE' }),
    );
  });

  it('lists archived warehouses on request', async () => {
    const response = await get('/warehouses?status=ARCHIVED').expect(200);
    expect(response.body.data.items).toEqual([
      expect.objectContaining({ name: 'Old Annex', archived: true }),
    ]);
  });

  for (const query of [
    'status=DELETED',
    'status=active',
    'page=0',
    'pageSize=51',
    `search=${'x'.repeat(101)}`,
  ])
    it(`rejects invalid list query ${query.slice(0, 30)}`, async () => {
      await get(`/warehouses?${query}`).expect(400);
      expect(findPage).not.toHaveBeenCalled();
    });

  it('uses the persisted company instead of submitted scope', async () => {
    await get(`/warehouses?companyId=${companyB}`, token({ orgId: companyB }))
      .set('X-Company-Id', companyB)
      .expect(200);
    expect(findPage).toHaveBeenCalledWith(companyA, expect.anything());
    const denied = await get(`/warehouses/${otherId}`).expect(404);
    expect(denied.body.message).toBe('Warehouse not found');
  });

  it('creates a normalized warehouse and ignores submitted tenant and archive fields', async () => {
    const response = await write('post', '/warehouses', {
      name: '  North   Depot ',
      address: ' Fictional  north road 2 ',
      companyId: companyB,
      archivedAt: null,
      archived: true,
    }).expect(201);
    const [calledActor, input] = create.mock.calls[0];
    expect(calledActor).toMatchObject({ sub: actor.id, orgId: companyA });
    expect({ ...input }).toEqual(valid);
    expect(response.body.data).toMatchObject({
      companyId: companyA,
      warehouse: { id: hubId, archived: false },
    });
  });

  it('edits and archives through explicit operations only', async () => {
    await write('patch', `/warehouses/${hubId}`, valid).expect(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: companyA }),
      hubId,
      expect.objectContaining(valid),
    );
    await write('put', `/warehouses/${hubId}/archive`, {
      archived: true,
    }).expect(200);
    await write('put', `/warehouses/${hubId}/archive`, {
      archived: false,
    }).expect(200);
    expect(setArchived.mock.calls.map((call) => call.slice(1))).toEqual([
      [hubId, true],
      [hubId, false],
    ]);
    for (const body of [{}, { archived: 'true' }, { archivedAt: null }])
      await write('put', `/warehouses/${hubId}/archive`, body).expect(400);
    expect(setArchived).toHaveBeenCalledTimes(2);
  });

  for (const body of [
    {},
    { name: 'A', address: 'Fictional road 1' },
    { name: 'x'.repeat(121), address: 'Fictional road 1' },
    { name: 'Valid Name', address: 'abc' },
    { name: 'Valid Name', address: 'x'.repeat(301) },
    { name: 42, address: 'Fictional road 1' },
  ])
    it(`rejects invalid warehouse input ${JSON.stringify(body).slice(0, 40)}`, async () => {
      await write('post', '/warehouses', body).expect(400);
      await write('patch', `/warehouses/${hubId}`, body).expect(400);
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

  it('rejects a missing or stale company context header before persistence', async () => {
    for (const context of [null, companyB]) {
      await write('post', '/warehouses', valid, context).expect(403);
      await write('patch', `/warehouses/${hubId}`, valid, context).expect(403);
      await write(
        'put',
        `/warehouses/${hubId}/archive`,
        { archived: true },
        context,
      ).expect(403);
    }
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(setArchived).not.toHaveBeenCalled();
  });

  for (const role of ['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'] as const)
    it(`denies ${role} reads and writes even with a Company Admin token`, async () => {
      actor.role = role;
      await get().expect(403);
      await write('post', '/warehouses', valid).expect(403);
      await write('patch', `/warehouses/${hubId}`, valid).expect(403);
      await write('put', `/warehouses/${hubId}/archive`, {
        archived: true,
      }).expect(403);
      expect(findPage).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(setArchived).not.toHaveBeenCalled();
    });

  it('requires authentication and valid ids', async () => {
    await request(app.getHttpServer()).get('/warehouses').expect(401);
    await request(app.getHttpServer())
      .post('/warehouses')
      .send(valid)
      .expect(401);
    await write('patch', '/warehouses/not-an-id', valid).expect(400);
    await write('put', '/warehouses/not-an-id/archive', {
      archived: true,
    }).expect(400);
    expect(update).not.toHaveBeenCalled();
    expect(setArchived).not.toHaveBeenCalled();
  });

  it('passes through not-found and conflict outcomes', async () => {
    update.mockRejectedValue(new NotFoundException('Warehouse not found'));
    await write('patch', `/warehouses/${otherId}`, valid).expect(404);
    setArchived.mockRejectedValue(
      new ConflictException('Warehouse has open pickup requests'),
    );
    const conflict = await write('put', `/warehouses/${hubId}/archive`, {
      archived: true,
    }).expect(409);
    expect(conflict.body.message).toBe('Warehouse has open pickup requests');
  });
});
