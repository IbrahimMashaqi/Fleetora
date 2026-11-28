import { VehiclesRepository } from '../vehicles/vehicles.repository.js';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
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
import { DriversModule } from './drivers.module.js';
import { DriversRepository } from './drivers.repository.js';
import type { ListDriversDto } from './dto/list-drivers.dto.js';
import type { UserRole } from '../auth/token/token.payload.js';

const companyA = '11111111-1111-4111-8111-111111111111';
const companyB = '22222222-2222-4222-8222-222222222222';
const firstId = '33333333-3333-4333-8333-333333333333';
const otherId = '44444444-4444-4444-8444-444444444444';
const rows = [
  {
    id: firstId,
    companyId: companyA,
    fullName: 'Amina Driver',
    phone: '+970599000001',
    status: 'ACTIVE',
    vehicle: {
      id: '99999999-9999-4999-8999-999999999999',
      companyId: companyA,
      type: 'VAN',
      plateNumber: 'DEMO-101',
      privateField: 'fixture-private',
    },
    password: 'fixture-private',
    refreshToken: 'fixture-private',
    verificationToken: 'fixture-private',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    companyId: companyA,
    fullName: 'Zaid Driver',
    phone: '+970599000002',
    status: 'OFFLINE',
    vehicle: null,
  },
  {
    id: otherId,
    companyId: companyB,
    fullName: 'Other Company Driver',
    phone: '+970599000003',
    status: 'SUSPENDED',
  },
];

// Real Nest HTTP pipeline, JWT signature validation, persisted-identity strategy,
// DTOs and service. Persistence is an explicit in-memory fixture; no AppModule/DB.
describe('Company Admin driver directory API (isolated fixtures)', () => {
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
  const setSuspended = vi.fn();
  const secret = 'isolated-driver-api-test-secret';
  const jwt = new JwtService({ secret });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [DriversModule],
      providers: [
        AccessTokenStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({ ACCESS_TOKEN_SECRET: secret }),
        },
        {
          provide: AuthRepository,
          useValue: { findUserById, isCompanyActiveForUser, findCompanyAccess: async () => ({approvalStatus:'ACTIVE',suspended:false,accessVersion:0}) },
        },
      ],
    })
      .overrideProvider(VehiclesRepository)
      .useValue({ assign: vi.fn() })
      .overrideProvider(DriversRepository)
      .useValue({ findPage, findOne, create, update, setSuspended })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
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
      async (companyId: string, query: ListDriversDto) =>
        rows
          .filter((row) => row.companyId === companyId)
          .filter(
            (row) =>
              !query.search ||
              `${row.fullName} ${row.phone}`
                .toLowerCase()
                .includes(query.search.toLowerCase()),
          )
          .sort(
            (a, b) =>
              a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id),
          )
          .slice(
            (query.page - 1) * query.pageSize,
            query.page * query.pageSize + 1,
          ),
    );
    findOne.mockImplementation(
      async (companyId: string, id: string) =>
        rows.find((row) => row.companyId === companyId && row.id === id) ??
        null,
    );
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
  function get(path = '/drivers', bearer = token()) {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${bearer}`);
  }

  it('lists only own drivers and strips private fields', async () => {
    const response = await get().expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.data).toEqual({
      companyId: companyA,
      items: [
        {
          id: firstId,
          name: 'Amina Driver',
          phone: '+970599000001',
          status: 'ACTIVE',
          vehicle: {
            id: '99999999-9999-4999-8999-999999999999',
            type: 'VAN',
            manufacturer: null,
            model: null,
            plateNumber: 'DEMO-101',
          },
        },
        {
          id: rows[1].id,
          name: 'Zaid Driver',
          phone: '+970599000002',
          status: 'OFFLINE',
          vehicle: null,
        },
      ],
      page: 1,
      pageSize: 20,
      hasNext: false,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|refreshToken|verificationToken|fixture-private|Other Company Driver/,
    );
    expect(findPage).toHaveBeenCalledWith(
      companyA,
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });
  it('does not expose a related vehicle belonging to another company', async () => {
    findOne.mockResolvedValue({
      ...rows[0],
      vehicle: {
        id: 'foreign-vehicle',
        companyId: companyB,
        type: 'TRUCK',
        plateNumber: 'PRIVATE-OTHER-TENANT',
      },
    });
    const result = await get(`/drivers/${firstId}`).expect(200);
    expect(result.body.data.driver.vehicle).toBeNull();
    expect(JSON.stringify(result.body)).not.toContain('PRIVATE-OTHER-TENANT');
  });
  it('uses current persisted role/company instead of stale JWT claims and submitted scope', async () => {
    const response = await get(
      `/drivers?companyId=${companyB}&role=PLATFORM_ADMIN`,
      token({ role: 'PLATFORM_ADMIN', orgId: companyB }),
    )
      .set('X-Company-Id', companyB)
      .expect(200);
    expect(
      response.body.data.items.map((item: { id: string }) => item.id),
    ).not.toContain(otherId);
    expect(findPage).toHaveBeenCalledWith(companyA, expect.anything());
  });
  it('searches and pages with a bounded lookahead without fabricated totals', async () => {
    const first = await get('/drivers?pageSize=1').expect(200);
    expect(first.body.data).toMatchObject({
      page: 1,
      pageSize: 1,
      hasNext: true,
    });
    expect(first.body.data.items).toHaveLength(1);
    const second = await get('/drivers?page=2&pageSize=1').expect(200);
    expect(second.body.data.items[0].name).toBe('Zaid Driver');
    expect(second.body.data.hasNext).toBe(false);
    const searched = await get('/drivers?search=%20AMINA%20').expect(200);
    expect(
      searched.body.data.items.map((item: { name: string }) => item.name),
    ).toEqual(['Amina Driver']);
    expect(searched.body.data).not.toHaveProperty('total');
    const phone = await get('/drivers?search=000002').expect(200);
    expect(
      phone.body.data.items.map((item: { name: string }) => item.name),
    ).toEqual(['Zaid Driver']);
    const empty = await get('/drivers?search=missing').expect(200);
    expect(empty.body.data.items).toEqual([]);
    expect(empty.body.data.hasNext).toBe(false);
  });
  it('follows a persisted company change even when the token still names the old company', async () => {
    const stale = token();
    actor.companyId = companyB;
    const response = await get('/drivers', stale).expect(200);
    expect(response.body.data.companyId).toBe(companyB);
    expect(
      response.body.data.items.map((item: { id: string }) => item.id),
    ).toEqual([otherId]);
    await get(`/drivers/${firstId}`, stale).expect(404);
  });
  it('denies Platform Admin even with persisted tenant context', async () => {
    actor.role = 'PLATFORM_ADMIN';
    await get().expect(403);
    await get(`/drivers/${firstId}`).expect(403);
    expect(findPage).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });
  it('returns own details and identical 404s for missing or other-company IDs', async () => {
    const own = await get(`/drivers/${firstId}`).expect(200);
    expect(own.headers['cache-control']).toBe('private, no-store');
    expect(own.body.data).toEqual({
      companyId: companyA,
      driver: {
        id: firstId,
        name: 'Amina Driver',
        phone: '+970599000001',
        status: 'ACTIVE',
        vehicle: {
          id: '99999999-9999-4999-8999-999999999999',
          type: 'VAN',
          manufacturer: null,
          model: null,
          plateNumber: 'DEMO-101',
        },
      },
    });
    for (const id of [otherId, '88888888-8888-4888-8888-888888888888']) {
      const denied = await get(`/drivers/${id}`).expect(404);
      expect(denied.body.message).toBe('Driver not found');
    }
  });
  for (const role of ['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'] as const) {
    it(`denies ${role} even when JWT claims Company Admin`, async () => {
      actor.role = role;
      if (role === 'PLATFORM_ADMIN') actor.companyId = null;
      for (const path of ['/drivers', `/drivers/${firstId}`])
        await get(
          path,
          token({ role: 'COMPANY_ADMIN', orgId: companyA }),
        ).expect(403);
      expect(findPage).not.toHaveBeenCalled();
      expect(findOne).not.toHaveBeenCalled();
    });
  }
  it('denies missing, invalid, expired, or revoked identity before persistence', async () => {
    for (const path of ['/drivers', `/drivers/${firstId}`])
      await request(app.getHttpServer()).get(path).expect(401);
    await get('/drivers', 'invalid-token').expect(401);
    await get(
      '/drivers',
      jwt.sign({ sub: actor.id }, { expiresIn: -1 }),
    ).expect(401);
    actor.isActive = false;
    await get().expect(401);
    actor.isActive = true;
    actor.isEmailVerified = false;
    await get().expect(401);
    actor.isEmailVerified = true;
    isCompanyActiveForUser.mockResolvedValue(false);
    await get().expect(401);
    expect(findPage).not.toHaveBeenCalled();
  });
  it('never fills a missing authenticated company from submitted scope', async () => {
    actor.companyId = null;
    await get(`/drivers?companyId=${companyA}`).expect(403);
    expect(findPage).not.toHaveBeenCalled();
  });
  for (const query of [
    'page=0',
    'page=-1',
    'page=1.5',
    'page=10001',
    'pageSize=0',
    'pageSize=51',
    'page=abc',
    'page=1&page=2',
    'search=a&search=b',
    `search=${'x'.repeat(101)}`,
  ]) {
    it(`rejects invalid pagination/search: ${query.slice(0, 35)}`, async () => {
      await get(`/drivers?${query}`).expect(400);
      expect(findPage).not.toHaveBeenCalled();
    });
  }
  it('rejects malformed IDs', async () => {
    await get('/drivers/not-an-id').expect(400);
    expect(findOne).not.toHaveBeenCalled();
  });

  function write(
    method: 'post' | 'patch' | 'put',
    path: string,
    body: Record<string, unknown>,
    context: string | null = companyA,
    bearer = token(),
  ) {
    const call = request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${bearer}`);
    if (context) call.set('X-Fleetora-Company-Context', context);
    return call.send(body);
  }

  describe('driver record writes', () => {
    beforeEach(() => {
      create.mockResolvedValue(firstId);
      update.mockResolvedValue(undefined);
      setSuspended.mockResolvedValue(undefined);
    });

    it('creates a normalized driver record and ignores submitted tenant, status, and account fields', async () => {
      const response = await write('post', '/drivers', {
        name: '  Amina   Driver ',
        phone: ' +970 599-000001 ',
        companyId: companyB,
        status: 'ACTIVE',
        email: 'driver@example.invalid',
        password: 'not-accepted',
      }).expect(201);
      expect(create).toHaveBeenCalledTimes(1);
      const [calledActor, input] = create.mock.calls[0];
      expect(calledActor).toMatchObject({ sub: actor.id, orgId: companyA });
      expect({ ...input }).toEqual({
        name: 'Amina Driver',
        phone: '+970 599-000001',
      });
      expect(response.body.data).toMatchObject({
        companyId: companyA,
        driver: { id: firstId, name: 'Amina Driver' },
      });
    });

    it('edits name and phone of an own driver', async () => {
      await write('patch', `/drivers/${firstId}`, {
        name: 'Amina D.',
        phone: '0599000009',
      }).expect(200);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: companyA }),
        firstId,
        expect.objectContaining({ name: 'Amina D.', phone: '0599000009' }),
      );
    });

    it('suspends and reactivates with a documented reason and reactivates through the authorized path', async () => {
      await write('put', `/drivers/${firstId}/suspension`, {
        suspended: true, reason: 'Documented operational review',
      }).expect(200);
      await write('put', `/drivers/${firstId}/suspension`, {
        suspended: false,
      }).expect(200);
      expect(setSuspended.mock.calls.map((call) => call.slice(1))).toEqual([
        [firstId, true, 'Documented operational review'],
        [firstId, false, undefined],
      ]);
      for (const body of [{}, { suspended: 'true' }, { status: 'SUSPENDED' }])
        await write('put', `/drivers/${firstId}/suspension`, body).expect(400);
      expect(setSuspended).toHaveBeenCalledTimes(2);
    });

    for (const body of [
      {},
      { name: 'A', phone: '0599000001' },
      { name: 'x'.repeat(151), phone: '0599000001' },
      { name: 'Valid Name', phone: '12' },
      { name: 'Valid Name', phone: 'call me' },
      { name: 'Valid Name', phone: '1'.repeat(41) },
      { name: 42, phone: '0599000001' },
    ])
      it(`rejects invalid driver input ${JSON.stringify(body).slice(0, 40)}`, async () => {
        await write('post', '/drivers', body).expect(400);
        await write('patch', `/drivers/${firstId}`, body).expect(400);
        expect(create).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
      });

    it('rejects a missing or stale company context header before persistence', async () => {
      const valid = { name: 'Valid Name', phone: '0599000001' };
      for (const context of [null, companyB]) {
        await write('post', '/drivers', valid, context).expect(403);
        await write('patch', `/drivers/${firstId}`, valid, context).expect(403);
        await write(
          'put',
          `/drivers/${firstId}/suspension`,
          { suspended: true, reason: 'Documented operational review' },
          context,
        ).expect(403);
      }
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(setSuspended).not.toHaveBeenCalled();
    });

    for (const role of ['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'] as const)
      it(`denies ${role} writes even with a Company Admin token`, async () => {
        actor.role = role;
        const valid = { name: 'Valid Name', phone: '0599000001' };
        await write('post', '/drivers', valid).expect(403);
        await write('patch', `/drivers/${firstId}`, valid).expect(403);
        await write('put', `/drivers/${firstId}/suspension`, {
          suspended: true, reason: 'Documented operational review',
        }).expect(403);
        expect(create).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        expect(setSuspended).not.toHaveBeenCalled();
      });

    it('requires authentication and a valid driver id for writes', async () => {
      await request(app.getHttpServer())
        .post('/drivers')
        .send({ name: 'Valid Name', phone: '0599000001' })
        .expect(401);
      await write('patch', '/drivers/not-an-id', {
        name: 'Valid Name',
        phone: '0599000001',
      }).expect(400);
      await write('put', '/drivers/not-an-id/suspension', {
        suspended: true, reason: 'Documented operational review',
      }).expect(400);
      expect(update).not.toHaveBeenCalled();
      expect(setSuspended).not.toHaveBeenCalled();
    });

    it('returns 404 when the repository does not find an own driver', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      update.mockRejectedValue(new NotFoundException('Driver not found'));
      setSuspended.mockRejectedValue(new NotFoundException('Driver not found'));
      await write('patch', `/drivers/${otherId}`, {
        name: 'Valid Name',
        phone: '0599000001',
      }).expect(404);
      await write('put', `/drivers/${otherId}/suspension`, {
        suspended: true, reason: 'Documented operational review',
      }).expect(404);
    });
  });
});
