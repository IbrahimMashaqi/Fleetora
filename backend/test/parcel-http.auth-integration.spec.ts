import { randomBytes, randomUUID } from 'node:crypto';
import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AccessTokenStrategy } from '../src/modules/auth/strategies/access-token.strategy.js';
import { AccessTokenGuard } from '../src/modules/auth/guards/access-token.guard.js';
import { ParcelsModule } from '../src/modules/parcels/parcels.module.js';
import { BusinessMerchantsController } from '../src/modules/merchants/business-merchants.controller.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';

// Make the real strategy/guard available inside the imported feature module.
class ParcelHttpAuthenticationModule {}
// Test files are outside the application's decorator compilation include.
// Apply the same Nest metadata without requiring decorator syntax in this file.
Global()(ParcelHttpAuthenticationModule);
Module({})(ParcelHttpAuthenticationModule);

type Client = { token: string; companyId: string; userId: string };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object in the HTTP response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Expected a string in the HTTP response');
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value))
    throw new Error('Expected an integer revision in the HTTP response');
  return value;
}
function data(response: { body: unknown }) {
  const body = record(response.body);
  expect(body.success).toBe(true);
  return record(body.data);
}
function entity(response: { body: unknown }, key: string) {
  return record(data(response)[key]);
}

describe('parcel HTTP with persisted JWT identity and disposable PostgreSQL', () => {
  const guard = new AuthPostgresTestGuard();
  const companyIds: string[] = [],
    userIds: string[] = [];
  let prisma: PrismaService, app: INestApplication, jwt: JwtService;
  let own: Client, foreign: Client, driverId: string, foreignDriverId: string;
  const key = () => randomUUID();
  const api = () => request(app.getHttpServer());
  const get = (path: string, client: Client = own) =>
    api().get(path).set('Authorization', client.token);
  const post = (path: string, client: Client = own) =>
    api()
      .post(path)
      .set('Authorization', client.token)
      .set('x-fleetora-company-context', client.companyId);
  const merchantInput = () => ({
    name: 'Fictional HTTP business',
    contactName: 'Fictional contact',
    phone: '+000000000',
    pickupAddress: 'Fictional merchant pickup',
    city: 'Fictional city',
    currency: 'ILS',
    deliveryFee: '15.00',
    returnFee: '5.00',
    serviceFee: '2.00',
    feePayer: 'MERCHANT',
    returnFeePolicy: 'ON_MERCHANT_HANDOFF',
  });
  const parcelInput = (merchantId: string) => ({
    merchantId,
    recipientName: 'Fictional HTTP recipient',
    recipientPhone: '+000000001',
    city: 'Fictional city',
    destination: 'Fictional destination',
    description: 'Fictional goods',
    pieces: 1,
    codAmount: '100.00',
    customerNotes: 'Call at the entrance',
  });
  async function merchant(client: Client = own) {
    return entity(
      await post('/merchants/business', client)
        .send(merchantInput())
        .expect(201),
      'merchant',
    );
  }
  async function parcel(merchantId: string, client: Client = own) {
    return entity(
      await post('/parcels', client).send(parcelInput(merchantId)).expect(201),
      'parcel',
    );
  }
  async function transition(
    row: Record<string, unknown>,
    status: string,
    client: Client = own,
    note?: string,
  ) {
    return entity(
      await post(`/parcels/${text(row.id)}/transition`, client)
        .send({
          revision: integer(row.revision),
          status,
          ...(note ? { note } : {}),
        })
        .expect(201),
      'parcel',
    );
  }
  async function dispatched(merchantId: string, client: Client = own) {
    let row = await parcel(merchantId, client);
    row = await transition(row, 'RECEIVED_FROM_MERCHANT', client);
    row = await transition(row, 'AT_WAREHOUSE', client);
    row = entity(
      await post(`/parcels/${text(row.id)}/assignment`, client)
        .send({
          revision: integer(row.revision),
          workerId: client === own ? driverId : foreignDriverId,
        })
        .expect(201),
      'parcel',
    );
    return transition(row, 'OUT_FOR_DELIVERY', client);
  }
  async function cleanup() {
    guard.assertVerified();
    for (const companyId of companyIds) {
      const orm = prisma.db.orm.public;
      await orm.SettlementPayment.where({ companyId }).deleteAll();
      await orm.SettlementAllocation.where({ companyId }).deleteAll();
      await orm.MerchantSettlementLine.where({ companyId }).deleteAll();
      await orm.MerchantSettlement.where({ companyId }).deleteAll();
      await orm.MerchantLedgerEntry.where({
        companyId,
        kind: 'REVERSAL',
      }).deleteAll();
      await orm.MerchantLedgerEntry.where({ companyId }).deleteAll();
      await orm.CashRemittance.where({ companyId }).deleteAll();
      await orm.CodCollection.where({ companyId }).deleteAll();
      await orm.ParcelAttempt.where({ companyId }).deleteAll();
      await orm.ParcelReturn.where({ companyId }).deleteAll();
      await prisma.ShipmentHistory.where((history) =>
        history.shipment.some((shipment) => shipment.companyId.eq(companyId)),
      ).deleteAll();
      await prisma.Shipment.where({ companyId }).deleteAll();
      await orm.Merchant.where({ companyId }).deleteAll();
      await orm.MonetaryRequest.where({ companyId }).deleteAll();
      await prisma.Worker.where({ companyId }).deleteAll();
      await prisma.User.where({ companyId }).deleteAll();
      await prisma.Company.where({ id: companyId }).delete();
    }
    // A test intentionally gives one subject the legitimate platform role/null company.
    for (const id of userIds) await prisma.User.where({ id }).delete();
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    const secret = randomBytes(48).toString('hex'),
      config = new ConfigService({ ACCESS_TOKEN_SECRET: secret });
    const auth = new AuthRepository(prisma);
    jwt = new JwtService({ secret });
    const module = await Test.createTestingModule({
      imports: [
        PrismaModule,
        {
          module: ParcelHttpAuthenticationModule,
          global: true,
          providers: [
            { provide: AuthRepository, useValue: auth },
            {
              provide: AccessTokenStrategy,
              useFactory: () => new AccessTokenStrategy(config, auth),
            },
            {
              provide: AccessTokenGuard,
              useFactory: (reflector: Reflector) =>
                new AccessTokenGuard(reflector),
              inject: [Reflector],
            },
          ],
          exports: [AccessTokenGuard, AuthRepository],
        },
        ParcelsModule,
      ],
      controllers: [BusinessMerchantsController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.listen(0, '127.0.0.1');
  }, 30000);
  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    const companies = await Promise.all([
      prisma.Company.create({ name: 'Owned parcel HTTP fixture' }),
      prisma.Company.create({ name: 'Foreign parcel HTTP fixture' }),
    ]);
    companyIds.push(...companies.map((company) => company.id));
    const clients: Client[] = [];
    for (const [index, company] of companies.entries()) {
      const user = await prisma.User.create({
        companyId: company.id,
        fullName: 'Fictional HTTP operator',
        email: `${randomUUID()}@example.invalid`,
        password: randomBytes(32).toString('hex'),
        role: 'COMPANY_ADMIN',
        isActive: true,
        isEmailVerified: true,
      });
      userIds.push(user.id);
      // Correctly signed but deliberately forged tenant/role claims. Persisted identity is authoritative.
      const token =
        'Bearer ' +
        jwt.sign(
          {
            sub: user.id,
            role: 'COMPANY_ADMIN',
            orgId: companies[index === 0 ? 1 : 0].id,
          },
          { expiresIn: '5m' },
        );
      clients.push({ token, companyId: company.id, userId: user.id });
    }
    [own, foreign] = clients;
    driverId = (
      await prisma.Worker.create({
        companyId: own.companyId,
        fullName: 'Fictional HTTP driver',
        phone: '+000000010',
      })
    ).id;
    foreignDriverId = (
      await prisma.Worker.create({
        companyId: foreign.companyId,
        fullName: 'Foreign HTTP driver',
        phone: '+000000020',
      })
    ).id;
  });
  afterAll(async () => {
    await app?.close();
    await guard.teardown(
      async () => {
        await guard.verify(() => readAuthPostgresIdentity(prisma));
        await cleanup();
      },
      async () => {
        await prisma?.db.close();
      },
    );
  });
  it('completes merchant, parcel, delivery, collection, remittance, settlement approval and actual payout over HTTP', async () => {
    const config = await get('/parcels/config').expect(200);
    expect(config.headers['cache-control']).toContain('no-store');
    expect(data(config)).toMatchObject({
      companyId: own.companyId,
      capabilities: { manageParcels: true, approveSettlements: true },
    });
    const merchantId = text((await merchant()).id);
    let row = await dispatched(merchantId);
    row = await transition(row, 'DELIVERED');
    const parcelId = text(row.id);
    expect(row).toMatchObject({
      status: 'DELIVERED',
      custody: 'CUSTOMER',
      attemptCount: 1,
      customerNotes: 'Call at the entrance',
      expectedCustomerTotal: '100.00',
    });
    const collection = entity(
      await post('/collections')
        .send({
          parcelId,
          amount: '100.00',
          method: 'CASH',
          notes: 'Customer cash received',
          idempotencyKey: key(),
        })
        .expect(201),
      'collection',
    );
    expect(collection).toMatchObject({
      amount: '100.00',
      goodsAmount: '100.00',
      remittedAt: null,
    });
    const remitted = entity(
      await post(`/collections/${text(collection.id)}/remittance`)
        .send({
          amount: '100.00',
          method: 'CASH',
          reference: 'Office receipt',
          notes: 'Counted in office',
          idempotencyKey: key(),
        })
        .expect(201),
      'collection',
    );
    expect(remitted.remittedAt).toEqual(expect.any(String));
    expect(remitted).toMatchObject({
      notes: 'Customer cash received',
      remittanceNotes: 'Counted in office',
    });
    const preview = entity(
      await post('/settlements/preview')
        .send({ merchantId, currency: 'ILS' })
        .expect(201),
      'preview',
    );
    expect(preview).toMatchObject({
      grossCollected: '100.00',
      deliveryFees: '17.00',
      returnFees: '0.00',
      netPayable: '83.00',
    });
    const draft = entity(
      await post('/settlements')
        .send({
          merchantId,
          currency: 'ILS',
          expectedPreviewHash: text(preview.previewHash),
          idempotencyKey: key(),
        })
        .expect(201),
      'settlement',
    );
    expect(draft.status).toBe('DRAFT');
    expect(draft.lines).toHaveLength(2);
    const settlementId = text(draft.id);
    const approved = entity(
      await post(`/settlements/${settlementId}/finalize`)
        .send({ revision: integer(draft.revision), idempotencyKey: key() })
        .expect(201),
      'settlement',
    );
    expect(approved.status).toBe('FINALIZED');
    expect(approved.payments).toEqual([]);
    const paid = entity(
      await post(`/settlements/${settlementId}/payment`)
        .send({
          revision: integer(approved.revision),
          amount: '83.00',
          method: 'BANK_TRANSFER',
          reference: 'Actual HTTP fixture payout',
          paidAt: new Date().toISOString(),
          idempotencyKey: key(),
        })
        .expect(201),
      'settlement',
    );
    expect(paid.status).toBe('PAID');
    expect(paid.payments).toHaveLength(1);
    expect(
      data(await get(`/merchants/business/${merchantId}`).expect(200)).balances,
    ).toEqual([
      { currency: 'ILS', balance: '0.00', eligible: '0.00', paid: '83.00' },
    ]);
    const detail = data(await get(`/parcels/${parcelId}`).expect(200));
    expect(detail.attempts).toHaveLength(1);
    expect(detail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'COD_COLLECTED',
          actorId: own.userId,
        }),
        expect.objectContaining({
          event: 'CASH_REMITTED',
          actorId: own.userId,
        }),
      ]),
    );
    expect(
      data(await get('/parcel-operations/dashboard').expect(200)),
    ).toMatchObject({
      companyId: own.companyId,
      counts: { total: 1, delivered: 1 },
      money: [
        {
          currency: 'ILS',
          unremittedCash: '0.00',
          merchantPayables: '0.00',
          settledAmounts: '83.00',
        },
      ],
    });
  });
  it('records a failed attempt and both return handoff stages with the correct return fee over HTTP', async () => {
    const merchantId = text((await merchant()).id);
    let row = await dispatched(merchantId);
    const parcelId = text(row.id);
    row = entity(
      await post(`/parcels/${parcelId}/attempts`)
        .send({
          revision: integer(row.revision),
          outcome: 'FAILED',
          reason: 'Recipient refused',
        })
        .expect(201),
      'parcel',
    );
    row = entity(
      await post('/returns')
        .send({
          parcelId,
          revision: integer(row.revision),
          reason: 'CUSTOMER_REFUSED',
          note: 'Return authorized',
        })
        .expect(201),
      'parcel',
    );
    const returnRecord = record(
        data(await get(`/parcels/${parcelId}`).expect(200)).returnRecord,
      ),
      returnId = text(returnRecord.id);
    row = entity(
      await post(`/returns/${returnId}/transition`)
        .send({
          revision: integer(row.revision),
          status: 'RETURNED_TO_WAREHOUSE',
        })
        .expect(201),
      'parcel',
    );
    row = entity(
      await post(`/returns/${returnId}/transition`)
        .send({
          revision: integer(row.revision),
          status: 'RETURNED_TO_MERCHANT',
        })
        .expect(201),
      'parcel',
    );
    expect(row).toMatchObject({
      status: 'RETURNED_TO_MERCHANT',
      custody: 'MERCHANT',
      attemptCount: 1,
    });
    const statement = data(
      await get(`/merchants/business/${merchantId}/statement`).expect(200),
    );
    expect(statement.items).toEqual([
      expect.objectContaining({ kind: 'RETURN_FEE', amount: '-5.00' }),
    ]);
    expect(
      data(await get(`/collections?merchantId=${merchantId}`).expect(200))
        .items,
    ).toEqual([]);
    await post(`/parcels/${parcelId}/transition`)
      .send({ revision: integer(row.revision), status: 'DELIVERED' })
      .expect(409);
  });
  it('requires real JWT authentication on operational and financial routes', async () => {
    for (const path of [
      '/merchants/business',
      '/parcels',
      '/returns',
      '/collections',
      '/settlements',
      '/parcel-operations/dashboard',
    ])
      await api().get(path).expect(401);
    await api().post('/merchants/business').send(merchantInput()).expect(401);
    await api()
      .get('/parcels')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
  it.each(['MERCHANT', 'PLATFORM_ADMIN'] as const)(
    'denies persisted %s despite a signed token claiming company administrator',
    async (role) => {
      await prisma.User.where({ id: own.userId }).update({
        role,
        companyId: role === 'PLATFORM_ADMIN' ? null : own.companyId,
      });
      await get('/parcels').expect(403);
      await get('/collections').expect(403);
      await post('/merchants/business').send(merchantInput()).expect(403);
    },
  );
  it('permits accountant reads while refusing operations and settlement approval despite forged administrator claims', async () => {
    await prisma.User.where({ id: own.userId }).update({ role: 'ACCOUNTANT' });
    expect(data(await get('/parcels/config').expect(200))).toMatchObject({
      companyId: own.companyId,
      capabilities: {
        manageParcels: false,
        collect: true,
        approveSettlements: false,
      },
    });
    await post('/merchants/business').send(merchantInput()).expect(403);
    await post(`/settlements/${randomUUID()}/finalize`)
      .send({ revision: 1, idempotencyKey: key() })
      .expect(403);
  });
  it('returns scoped 404 for foreign merchants, parcels, drivers, returns and settlements', async () => {
    const foreignMerchant = text((await merchant(foreign)).id);
    let foreignParcel = await parcel(foreignMerchant, foreign);
    const foreignParcelId = text(foreignParcel.id);
    await get(`/merchants/business/${foreignMerchant}`).expect(404);
    await get(`/parcels/${foreignParcelId}`).expect(404);
    await post('/parcels').send(parcelInput(foreignMerchant)).expect(404);
    foreignParcel = await transition(
      foreignParcel,
      'RECEIVED_FROM_MERCHANT',
      foreign,
    );
    await post('/returns', foreign)
      .send({
        parcelId: foreignParcelId,
        revision: integer(foreignParcel.revision),
        reason: 'MERCHANT_REQUESTED',
      })
      .expect(201);
    const foreignReturn = record(
      data(await get(`/parcels/${foreignParcelId}`, foreign).expect(200))
        .returnRecord,
    );
    await post(`/returns/${text(foreignReturn.id)}/transition`)
      .send({ revision: 3, status: 'RETURNED_TO_WAREHOUSE' })
      .expect(404);
    await post('/financial/adjustments', foreign)
      .send({
        merchantId: foreignMerchant,
        currency: 'ILS',
        amount: '10.00',
        reason: 'Approved foreign fixture credit',
        idempotencyKey: key(),
      })
      .expect(201);
    const preview = entity(
      await post('/settlements/preview', foreign)
        .send({ merchantId: foreignMerchant, currency: 'ILS' })
        .expect(201),
      'preview',
    );
    const foreignSettlement = entity(
      await post('/settlements', foreign)
        .send({
          merchantId: foreignMerchant,
          currency: 'ILS',
          expectedPreviewHash: text(preview.previewHash),
          idempotencyKey: key(),
        })
        .expect(201),
      'settlement',
    );
    await get(`/settlements/${text(foreignSettlement.id)}`).expect(404);
    const ownMerchant = text((await merchant()).id);
    let ownParcel = await parcel(ownMerchant);
    ownParcel = await transition(ownParcel, 'RECEIVED_FROM_MERCHANT');
    ownParcel = await transition(ownParcel, 'AT_WAREHOUSE');
    await post(`/parcels/${text(ownParcel.id)}/assignment`)
      .send({
        revision: integer(ownParcel.revision),
        workerId: foreignDriverId,
      })
      .expect(404);
    expect(data(await get('/parcels').expect(200)).items).toEqual([
      expect.objectContaining({ id: ownParcel.id, companyId: own.companyId }),
    ]);
    expect(data(await get('/returns').expect(200)).items).toEqual([]);
    expect(data(await get('/settlements').expect(200)).items).toEqual([]);
    expect(
      data(await get('/parcel-operations/dashboard').expect(200)),
    ).toMatchObject({
      companyId: own.companyId,
      counts: { total: 1 },
      money: [{ currency: 'ILS', merchantPayables: '0.00' }],
    });
  });
  it('rejects missing/stale company context and invalid exact money through the HTTP validation pipeline', async () => {
    await api()
      .post('/merchants/business')
      .set('Authorization', own.token)
      .send(merchantInput())
      .expect(403);
    await api()
      .post('/merchants/business')
      .set('Authorization', own.token)
      .set('x-fleetora-company-context', foreign.companyId)
      .send(merchantInput())
      .expect(403);
    await post('/merchants/business')
      .send({ ...merchantInput(), deliveryFee: '0.001' })
      .expect(400);
    const merchantId = text((await merchant()).id);
    await post('/parcels')
      .send({ ...parcelInput(merchantId), codAmount: '0.001' })
      .expect(400);
    await post('/parcels')
      .send({ ...parcelInput(merchantId), codAmount: 100 })
      .expect(400);
    // The application's global whitelist removes non-writable fields before
    // controller validation. Assert the protected persisted values explicitly.
    const created = entity(
      await post('/parcels')
        .send({
          ...parcelInput(merchantId),
          companyId: foreign.companyId,
          requestedBy: foreign.userId,
          workerId: foreignDriverId,
          currency: 'JOD',
          status: 'DELIVERED',
        })
        .expect(201),
      'parcel',
    );
    expect(created).toMatchObject({
      companyId: own.companyId,
      requestedBy: own.userId,
      workerId: null,
      currency: 'ILS',
      status: 'CREATED',
      attemptCount: 0,
    });
    expect(data(await get('/parcels').expect(200)).items).toEqual([
      expect.objectContaining({
        id: created.id,
        companyId: own.companyId,
        status: 'CREATED',
      }),
    ]);
  });
  it('rejects a persisted inactive identity even when its JWT is correctly signed and unexpired', async () => {
    await prisma.User.where({ id: own.userId }).update({ isActive: false });
    await get('/parcels').expect(401);
    await post('/merchants/business').send(merchantInput()).expect(401);
  });
});
