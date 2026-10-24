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
          useValue: { findUserById, isCompanyActiveForUser },
        },
      ],
    })
      .overrideProvider(VehiclesRepository)
      .useValue({ assign: vi.fn() })
      .overrideProvider(DriversRepository)
      .useValue({ findPage, findOne })
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
  it('rejects malformed IDs and exposes no create operation', async () => {
    await get('/drivers/not-an-id').expect(400);
    expect(findOne).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/drivers')
      .set('Authorization', `Bearer ${token()}`)
      .send({ name: 'Unsafe account', companyId: companyB })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/drivers/${firstId}`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ name: 'Changed' })
      .expect(404);
  });
});
