import 'temporal-polyfill/full/global';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { AccessTokenStrategy } from '../auth/strategies/access-token.strategy.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';
import { VehiclesRepository } from './vehicles.repository.js';
import { DriversController } from '../drivers/drivers.controller.js';
import { DriversService } from '../drivers/drivers.service.js';
import { DriversRepository } from '../drivers/drivers.repository.js';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from '../../common/exceptions-filter/http-exception.filter.js';
const company = '11111111-1111-4111-8111-111111111111',
  id = '33333333-3333-4333-8333-333333333333',
  foreign = '44444444-4444-4444-8444-444444444444';
const row = {
  id,
  companyId: company,
  manufacturer: 'Toyota',
  model: 'Corolla',
  type: 'CAR',
  plateNumber: 'TEST-42',
  worker: {
    id: foreign,
    companyId: company,
    fullName: 'Fictional Driver',
    password: 'private',
  },
  token: 'private',
};
const input = {
  manufacturer: 'VW',
  model: 'Golf',
  type: 'CAR',
  plateNumber: ' test-42 ',
};
describe('vehicle HTTP boundary with isolated persistence', () => {
  let app: INestApplication<App>;
  let role = 'COMPANY_ADMIN';
  let active = true;
  let verified = true;
  const repository = {
    list: vi.fn(),
    find: vi.fn(),
    save: vi.fn(),
    assign: vi.fn(),
    remove: vi.fn(),
  };
  const jwt = new JwtService({ secret: 'isolated-fleet-secret' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VehiclesController, DriversController],
      providers: [
        VehiclesService,
        DriversService,
        AccessTokenStrategy,
        { provide: VehiclesRepository, useValue: repository },
        {
          provide: DriversRepository,
          useValue: {
            findOne: async () => ({
              id,
              fullName: 'Driver',
              phone: '',
              status: 'ACTIVE',
              vehicle: null,
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            ACCESS_TOKEN_SECRET: 'isolated-fleet-secret',
          }),
        },
        {
          provide: AuthRepository,
          useValue: {
            findUserById: async () => ({
              id: 'admin',
              role,
              companyId: company,
              email: 'demo@example.invalid',
              isActive: active,
              isEmailVerified: verified,
            }),
            isCompanyActiveForUser: async () => true,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  beforeEach(() => {
    role = 'COMPANY_ADMIN';
    active = true;
    verified = true;
    vi.clearAllMocks();
    repository.list.mockResolvedValue([row]);
    repository.find.mockImplementation(async (c: string, v: string) =>
      c === company && v === id ? row : null,
    );
    repository.save.mockResolvedValue(id);
    repository.remove.mockResolvedValue(undefined);
  });
  afterAll(async () => {
    await app.close();
  });
  function auth() {
    return jwt.sign(
      { sub: 'admin', role: 'COMPANY_ADMIN', orgId: company },
      { expiresIn: '5m' },
    );
  }
  function get(path = '/vehicles') {
    return request(app.getHttpServer())
      .get(path)
      .auth(auth(), { type: 'bearer' });
  }
  function post(body: object = input) {
    return request(app.getHttpServer())
      .post('/vehicles')
      .auth(auth(), { type: 'bearer' })
      .set('X-Fleetora-Company-Context', company)
      .send(body);
  }
  function remove(vehicleId = id, context = company) {
    return request(app.getHttpServer())
      .delete(`/vehicles/${vehicleId}`)
      .auth(auth(), { type: 'bearer' })
      .set('X-Fleetora-Company-Context', context);
  }
  it('deletes with validated company context and returns an empty 204', async () => {
    const response = await remove().expect(204);
    expect(response.text).toBe('');
    expect(repository.remove).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        sub: 'admin',
        orgId: company,
        role: 'COMPANY_ADMIN',
      }),
      id,
    );
  });
  it('rejects unauthenticated deletion', async () => {
    await request(app.getHttpServer()).delete(`/vehicles/${id}`).expect(401);
    expect(repository.remove).not.toHaveBeenCalled();
  });
  it.each(['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'])(
    'rejects deletion by persisted %s',
    async (denied) => {
      role = denied;
      await remove().expect(403);
      expect(repository.remove).not.toHaveBeenCalled();
    },
  );
  it.each(['inactive', 'unverified'])(
    'rejects deletion by an %s account',
    async (state) => {
      active = state !== 'inactive';
      verified = state !== 'unverified';
      await remove().expect(401);
      expect(repository.remove).not.toHaveBeenCalled();
    },
  );
  it('rejects malformed IDs and missing or mismatched company context before deletion', async () => {
    await remove('invalid').expect(400);
    await remove(id, 'another-company').expect(403);
    await request(app.getHttpServer())
      .delete(`/vehicles/${id}`)
      .auth(auth(), { type: 'bearer' })
      .expect(403);
    expect(repository.remove).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/vehicles').expect(401);
    expect(repository.list).not.toHaveBeenCalled();
  });
  it.each(['PLATFORM_ADMIN', 'MERCHANT', 'ACCOUNTANT'])(
    'denies persisted %s despite admin JWT',
    async (denied) => {
      role = denied;
      await get().expect(403);
      await post().expect(403);
      await request(app.getHttpServer())
        .put(`/drivers/${id}/vehicle`)
        .auth(auth(), { type: 'bearer' })
        .set('X-Fleetora-Company-Context', company)
        .send({ vehicleId: null, expectedVehicleId: null })
        .expect(403);
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.assign).not.toHaveBeenCalled();
    },
  );
  it.each(['inactive', 'unverified'])('denies %s identities', async (state) => {
    active = state !== 'inactive';
    verified = state !== 'unverified';
    await post().expect(401);
  });
  it('scopes list and projects only allowed vehicle and driver fields', async () => {
    const response = await get(
      '/vehicles?search=Toyota&page=2&pageSize=1&unassigned=true&companyId=foreign',
    ).expect(200);
    expect(repository.list).toHaveBeenCalledWith(
      company,
      expect.objectContaining({
        search: 'Toyota',
        page: 2,
        pageSize: 1,
        unassigned: true,
      }),
    );
    expect(response.body.data.items[0]).toEqual({
      id,
      manufacturer: 'Toyota',
      model: 'Corolla',
      type: 'CAR',
      plateNumber: 'TEST-42',
      assignedDriver: { id: foreign, name: 'Fictional Driver' },
    });
    expect(JSON.stringify(response.body)).not.toContain('private');
  });
  it('hides an invalid foreign-company related driver', async () => {
    repository.list.mockResolvedValue([
      { ...row, worker: { ...row.worker, companyId: 'foreign' } },
    ]);
    expect(
      (await get().expect(200)).body.data.items[0].assignedDriver,
    ).toBeNull();
  });
  it('returns the same missing response for foreign and unknown IDs', async () => {
    const a = await get(`/vehicles/${foreign}`).expect(404);
    const b = await get(
      '/vehicles/55555555-5555-4555-8555-555555555555',
    ).expect(404);
    expect(a.body.message).toEqual(b.body.message);
  });
  it('normalizes creation and strips unauthorized ownership fields', async () => {
    await post({ ...input, companyId: 'foreign', workerId: foreign }).expect(
      201,
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: company }),
      expect.objectContaining({
        manufacturer: 'Volkswagen',
        plateNumber: 'TEST-42',
      }),
      undefined,
    );
    expect(repository.save.mock.calls[0][1]).not.toHaveProperty('companyId');
  });
  it('rejects stale and missing mutation context', async () => {
    await request(app.getHttpServer())
      .post('/vehicles')
      .auth(auth(), { type: 'bearer' })
      .send(input)
      .expect(403);
    await request(app.getHttpServer())
      .post('/vehicles')
      .auth(auth(), { type: 'bearer' })
      .set('X-Fleetora-Company-Context', 'foreign')
      .send(input)
      .expect(403);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it.each([
    { type: 'OTHER', plateNumber: 'TEST' },
    { ...input, plateNumber: '' },
    { ...input, model: 'x'.repeat(101) },
  ])('validates create fields', async (body) => {
    await post(body).expect(400);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it.each([
    '/vehicles?page=0',
    '/vehicles?pageSize=51',
    '/vehicles?unassigned=other',
    '/vehicles/not-a-uuid',
  ])('validates %s', async (path) => {
    await get(path).expect(400);
  });
  it('edits only the selected tenant vehicle', async () => {
    await request(app.getHttpServer())
      .patch(`/vehicles/${id}`)
      .auth(auth(), { type: 'bearer' })
      .set('X-Fleetora-Company-Context', company)
      .send(input)
      .expect(200);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: company }),
      expect.objectContaining({ type: 'CAR' }),
      id,
    );
  });
  it('requires explicit assignment compare-and-set and accepts unassignment', async () => {
    await request(app.getHttpServer())
      .put(`/drivers/${id}/vehicle`)
      .auth(auth(), { type: 'bearer' })
      .set('X-Fleetora-Company-Context', company)
      .send({ vehicleId: null })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/drivers/${id}/vehicle`)
      .auth(auth(), { type: 'bearer' })
      .set('X-Fleetora-Company-Context', company)
      .send({ vehicleId: null, expectedVehicleId: null })
      .expect(200);
    expect(repository.assign).toHaveBeenCalledOnce();
  });
});
