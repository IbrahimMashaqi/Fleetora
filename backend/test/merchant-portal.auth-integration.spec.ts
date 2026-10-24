import { randomBytes, randomUUID } from 'node:crypto';
import {
  Global,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Workbook } from 'exceljs';
import * as bcrypt from 'bcrypt';
import { verifyMerchantBrowser } from './merchant-browser.js';
import { verifyMerchantAndroid } from './merchant-android.js';
import { configureMerchantImportBody } from '../src/modules/merchant-portal/merchant-import-body.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { PrismaModule } from '../src/modules/prisma/prisma.module.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { MerchantPortalModule } from '../src/modules/merchant-portal/merchant-portal.module.js';
import { ParcelsModule } from '../src/modules/parcels/parcels.module.js';
import { BusinessMerchantsController } from '../src/modules/merchants/business-merchants.controller.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import {
  AuthPostgresTestGuard,
  readAuthPostgresIdentity,
} from './auth-postgres.safety.js';
class IsolatedMerchantConfiguration {}
Global()(IsolatedMerchantConfiguration);
const secret = randomBytes(48).toString('hex');
const configuration = new ConfigService({
  ACCESS_TOKEN_SECRET: secret,
  REFRESH_TOKEN_SECRET: randomBytes(48).toString('hex'),
  SALT_ROUNDS: 4,
});
Module({
  providers: [
    { provide: ConfigService, useValue: configuration },
    {
      provide: MailService,
      useValue: {
        sendVerificationEmail() {
          throw new Error(
            'No email delivery in isolated manual invitation workflow',
          );
        },
      },
    },
  ],
  exports: [ConfigService, MailService],
})(IsolatedMerchantConfiguration);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected response object');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown) {
  if (typeof value !== 'string') throw new Error('Expected response string');
  return value;
}
function number(value: unknown) {
  if (typeof value !== 'number') throw new Error('Expected response number');
  return value;
}
function data(response: { body: unknown }) {
  return object(object(response.body).data);
}
function entity(response: { body: unknown }, name: string) {
  return object(data(response)[name]);
}
describe('merchant app -> actual Nest HTTP -> PostgreSQL -> company operations', () => {
  const guard = new AuthPostgresTestGuard(),
    companies: string[] = [];
  let app: INestApplication, prisma: PrismaService, jwt: JwtService;
  let admin: string,
    foreignAdmin: string,
    companyId: string,
    merchantId: string,
    zoneId: string,
    planId: string,
    owner: string,
    secondOwner: string,
    driverId: string;
  const api = () => request(app.getHttpServer());
  const get = (path: string, token = owner) =>
    api().get(path).set('Authorization', `Bearer ${token}`);
  const post = (path: string, token = owner) =>
    api()
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .set(
        'x-fleetora-company-context',
        jwt.decode<{ orgId: string }>(token).orgId,
      );
  const password = 'IsolatedMerchantPassword7';
  async function company() {
    const row = await prisma.Company.create({
      name: 'Isolated merchant portal company',
    });
    companies.push(row.id);
    const user = await prisma.User.create({
      companyId: row.id,
      fullName: 'Fixture admin',
      email: `${randomUUID()}@example.invalid`,
      password: 'Not a production login',
      role: 'COMPANY_ADMIN',
      isEmailVerified: true,
    });
    return {
      id: row.id,
      token: await jwt.signAsync({
        sub: user.id,
        orgId: row.id,
        role: user.role,
        email: user.email,
      }),
    };
  }
  async function merchant(token = admin) {
    return text(
      entity(
        await post('/merchants/business', token)
          .send({
            name: 'Fictional merchant',
            contactName: 'Fictional contact',
            phone: '+000000000',
            city: 'Fixture city',
            pickupAddress: 'Fixture merchant pickup',
            latitude: 31.9,
            longitude: 35.2,
            currency: 'ILS',
            deliveryFee: '15.00',
            returnFee: '5.00',
            serviceFee: '0.00',
            feePayer: 'MERCHANT',
          })
          .expect(201),
        'merchant',
      ).id,
    );
  }
  async function activate(id: string, permission?: string[]) {
    const email = `${randomUUID()}@example.invalid`;
    const invitation = data(
      await post(`/operations/merchants/${id}/invitations`, admin)
        .send({
          email,
          role: permission ? 'EMPLOYEE' : 'OWNER',
          permissions: permission ?? [],
        })
        .expect(201),
    );
    await api()
      .post('/merchant/invitations/accept')
      .send({
        token: invitation.token,
        name: 'Fictional merchant owner',
        password,
      })
      .expect(201);
    const login = data(
      await api().post('/auth/signin').send({ email, password }).expect(200),
    );
    return text(login.accessToken);
  }
  async function parcelInput(amount = '150.00', token = owner) {
    const preview = entity(
      await post('/merchant/pricing-preview', token)
        .send({ zoneId, finalCustomerAmount: amount })
        .expect(201),
      'preview',
    );
    return {
      recipientName: 'Fictional recipient',
      recipientPhone: '+000000001',
      city: 'Fixture city',
      destination: 'Fixture customer address',
      description: 'Fixture goods',
      pieces: 1,
      zoneId,
      finalCustomerAmount: amount,
      collectionMode: amount === '0.00' ? 'PREPAID' : 'COD',
      pricingVersion: preview.pricingVersion,
      idempotencyKey: randomUUID(),
    };
  }
  async function createParcel(amount = '150.00') {
    return entity(
      await post('/merchant/parcels')
        .send(await parcelInput(amount))
        .expect(201),
      'parcel',
    );
  }
  beforeAll(async () => {
    prisma = new PrismaService();
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    const module = await Test.createTestingModule({
      imports: [
        IsolatedMerchantConfiguration,
        PrismaModule,
        MerchantPortalModule,
        ParcelsModule,
      ],
      controllers: [BusinessMerchantsController],
    })
      .overrideProvider(ConfigService)
      .useValue(configuration)
      .compile();
    app = module.createNestApplication();
    configureMerchantImportBody(app);
    app.enableCors(); // Disposable browser test origins only; production bootstrap is unchanged.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    jwt = new JwtService({ secret });
  });
  beforeEach(async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    const own = await company(),
      foreign = await company();
    companyId = own.id;
    admin = own.token;
    foreignAdmin = foreign.token;
    merchantId = await merchant();
    zoneId = text(
      entity(
        await post('/merchant-pricing/zones', admin)
          .send({
            name: 'Fixture neighborhood',
            city: 'Fixture city',
            baseFee: '15.00',
            currency: 'ILS',
          })
          .expect(201),
        'zone',
      ).id,
    );
    planId = text(
      entity(
        await post('/merchant-pricing/plans', admin)
          .send({ name: 'Fixture commercial plan', currency: 'ILS' })
          .expect(201),
        'plan',
      ).id,
    );
    await api()
      .put(`/merchant-pricing/merchants/${merchantId}/plan`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ planId, discountAmount: '0.00', revision: 1 })
      .expect(200);
    owner = await activate(merchantId);
    secondOwner = await activate(await merchant());
    driverId = (
      await prisma.Worker.create({
        companyId,
        fullName: 'Fixture pickup driver',
        phone: '+000000002',
      })
    ).id;
  });
  it('accepts an invitation, signs in through existing authentication and persists final150/fee15 visible only to the owning company and merchant', async () => {
    const input = await parcelInput();
    const row = entity(
      await post('/merchant/parcels').send(input).expect(201),
      'parcel',
    );
    expect(row).toMatchObject({
      companyId,
      merchantId,
      requestedBy: expect.any(String),
      codAmount: '150.00',
      expectedCustomerTotal: '150.00',
      finalCustomerAmount: '150.00',
      deliveryFee: '15.00',
      status: 'CREATED',
      custody: 'MERCHANT',
    });
    expect(data(await get('/parcels', admin).expect(200)).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: row.id,
          expectedCustomerTotal: '150.00',
        }),
      ]),
    );
    await get(`/merchant/parcels/${text(row.id)}`, secondOwner).expect(404);
    await get(`/parcels/${text(row.id)}`, foreignAdmin).expect(404);
    // Existing global whitelist strips unknown fields before controller pipes.
    // Prove the forged tenant cannot change ownership or duplicate the request.
    expect(
      entity(
        await post('/merchant/parcels')
          .send({ ...input, companyId: randomUUID() })
          .expect(201),
        'parcel',
      ),
    ).toMatchObject({ id: row.id, companyId, merchantId });
    const repeated = entity(
      await post('/merchant/parcels').send(input).expect(201),
      'parcel',
    );
    expect(repeated.id).toBe(row.id);
    await post('/merchant/parcels')
      .send({ ...input, finalCustomerAmount: '151.00' })
      .expect(409);
    const label = data(
      await get(`/merchant/parcels/${text(row.id)}/label`).expect(200),
    );
    expect(label.qrSvg).toContain('<svg');
    expect(label.qrSvg).not.toContain('Fictional recipient');
    expect(label.trackingNumber).toBe(row.trackingNumber);
  });
  it('requires a fresh pricing preview before confirmation and never changes historical terms after plan edits', async () => {
    const input = await parcelInput();
    const row = await createParcel();
    await api()
      .patch(`/merchant-pricing/zones/${zoneId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        name: 'Fixture neighborhood',
        city: 'Fixture city',
        baseFee: '20.00',
        currency: 'ILS',
        revision: 1,
      })
      .expect(200);
    await post('/merchant/parcels').send(input).expect(409);
    expect(
      entity(
        await get(`/merchant/parcels/${text(row.id)}`).expect(200),
        'parcel',
      ),
    ).toMatchObject({ deliveryFee: '15.00', finalCustomerAmount: '150.00' });
    expect(entity(await createResponse(), 'parcel').deliveryFee).toBe('20.00');
    async function createResponse() {
      return post('/merchant/parcels')
        .send(await parcelInput())
        .expect(201);
    }
  });
  it('supports individual employee permissions without granting finances and immediately enforces revoked membership', async () => {
    const token = await activate(merchantId, ['PARCEL_VIEW', 'PARCEL_CREATE']);
    await get('/merchant/parcels', token).expect(200);
    await get('/merchant/statement', token).expect(403);
    await post('/merchant/settlement-requests', token)
      .send({ currency: 'ILS', idempotencyKey: randomUUID() })
      .expect(403);
    await get('/merchant/employees', token).expect(403);
    await get('/merchant/activity', token).expect(403);
    const row = entity(
      await post('/merchant/parcels', token)
        .send(await parcelInput('150.00', token))
        .expect(201),
      'parcel',
    );
    const tokenUser = jwt.decode<{ sub: string }>(token);
    expect(row.requestedBy).toBe(tokenUser.sub);
    await prisma.db.orm.public.MerchantMembership.where({
      userId: tokenUser.sub,
      companyId,
    }).update({ status: 'REVOKED' });
    await get('/merchant/parcels', token).expect(403);
  });
  it('groups pickup preferences, requires actual receipt, delivers directly without warehouse and posts a zero-COD service charge without cash', async () => {
    const first = await createParcel('0.00'),
      second = await createParcel();
    const pickup = entity(
      await post('/merchant/pickups')
        .send({
          parcelIds: [first.id, second.id],
          method: 'COMPANY_PICKUP',
          preferredFrom: '2026-10-23T08:00:00Z',
          preferredTo: '2026-10-23T10:00:00Z',
          pickupAddress: 'Alternate fixture address',
          idempotencyKey: randomUUID(),
        })
        .expect(201),
      'pickup',
    );
    expect(pickup).toMatchObject({
      status: 'REQUESTED',
      latitude: null,
      longitude: null,
      confirmedFrom: null,
    });
    expect(
      entity(
        await get(`/merchant/parcels/${text(first.id)}`).expect(200),
        'parcel',
      ).custody,
    ).toBe('MERCHANT');
    await get(`/merchant/pickups/${text(pickup.id)}`, secondOwner).expect(404);
    await get(`/pickups/${text(pickup.id)}`, foreignAdmin).expect(404);
    const proposed = entity(
      await post(`/pickups/${text(pickup.id)}/review`, admin)
        .send({
          revision: 1,
          action: 'PROPOSE',
          from: '2026-10-23T10:00:00Z',
          to: '2026-10-23T12:00:00Z',
          workerId: driverId,
        })
        .expect(201),
      'pickup',
    );
    expect(proposed).toMatchObject({ status: 'PROPOSED', confirmedFrom: null });
    const confirmed = entity(
      await post(`/merchant/pickups/${text(pickup.id)}/action`)
        .send({ revision: 2, action: 'ACCEPT_PROPOSAL' })
        .expect(201),
      'pickup',
    );
    expect(confirmed.status).toBe('CONFIRMED');
    await post(`/pickups/${text(pickup.id)}/receipts`, admin)
      .send({
        revision: 3,
        parcels: [
          { parcelId: first.id, receipt: 'RECEIVED' },
          { parcelId: second.id, receipt: 'MISSING', notes: 'Not handed over' },
        ],
      })
      .expect(201);
    let received = entity(
      await get(`/parcels/${text(first.id)}`, admin).expect(200),
      'parcel',
    );
    expect(received).toMatchObject({
      status: 'RECEIVED_FROM_MERCHANT',
      custody: 'DRIVER',
      workerId: driverId,
    });
    await api()
      .patch(`/merchant/parcels/${text(first.id)}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({
        ...(await parcelInput('0.00')),
        revision: number(received.revision),
      })
      .expect(409);
    received = entity(
      await post(`/parcels/${text(first.id)}/assignment`, admin)
        .send({ workerId: driverId, revision: received.revision })
        .expect(201),
      'parcel',
    );
    received = entity(
      await post(`/parcels/${text(first.id)}/transition`, admin)
        .send({ status: 'OUT_FOR_DELIVERY', revision: received.revision })
        .expect(201),
      'parcel',
    );
    await post(`/parcels/${text(first.id)}/attempts`, admin)
      .send({ outcome: 'DELIVERED', revision: received.revision })
      .expect(201);
    await post('/collections', admin)
      .send({
        parcelId: first.id,
        amount: '0.00',
        method: 'CASH',
        idempotencyKey: randomUUID(),
      })
      .expect(400);
    expect(data(await get('/merchant/statement').expect(200))).toMatchObject({
      items: [
        expect.objectContaining({ kind: 'DELIVERY_FEE', amount: '-15.00' }),
      ],
      balances: [expect.objectContaining({ balance: '-15.00' })],
    });
    expect(
      await prisma.db.orm.public.CodCollection.where({ companyId }).all(),
    ).toEqual([]);
  });
  it('keeps warehouse drop-off pending until authorized staff confirm each actual arrival', async () => {
    const row = await createParcel();
    const warehouse = await prisma.Warehouse.create({
      companyId,
      name: 'Fixture warehouse',
      address: 'Fixture intake desk',
    });
    const pickup = entity(
      await post('/merchant/pickups')
        .send({
          method: 'WAREHOUSE_DROPOFF',
          parcelIds: [row.id],
          warehouseId: warehouse.id,
          idempotencyKey: randomUUID(),
        })
        .expect(201),
      'pickup',
    );
    await post(`/pickups/${text(pickup.id)}/receipts`, admin)
      .send({
        revision: 1,
        parcels: [{ parcelId: row.id, receipt: 'RECEIVED' }],
      })
      .expect(409);
    await post(`/pickups/${text(pickup.id)}/review`, admin)
      .send({
        revision: 1,
        action: 'CONFIRM',
        from: '2026-10-23T08:00:00Z',
        to: '2026-10-23T17:00:00Z',
        warehouseId: warehouse.id,
      })
      .expect(201);
    await post(`/pickups/${text(pickup.id)}/receipts`, admin)
      .send({
        revision: 2,
        parcels: [{ parcelId: row.id, receipt: 'RECEIVED' }],
      })
      .expect(201);
    expect(
      entity(
        await get(`/merchant/parcels/${text(row.id)}`).expect(200),
        'parcel',
      ),
    ).toMatchObject({
      status: 'AT_WAREHOUSE',
      custody: 'WAREHOUSE',
      warehouseId: warehouse.id,
    });
  });
  it('previews Excel row errors, imports valid rows exactly once and exposes no fake all-success count', async () => {
    const template = data(await get('/merchant/imports/template').expect(200));
    const book = new Workbook();
    await book.xlsx.load(
      Uint8Array.from(Buffer.from(text(template.fileBase64), 'base64')).buffer,
    );
    const sheet = book.getWorksheet('Parcels');
    if (!sheet) throw new Error('Template sheet missing');
    sheet.addRow([
      'Fixture recipient',
      '+000000003',
      '',
      'Fixture city',
      'Fixture delivery address',
      zoneId,
      '150.00',
      'COD',
      'Fixture parcel',
      1,
    ]);
    sheet.addRow([
      '',
      '+000000004',
      '',
      'Fixture city',
      'Fixture delivery address',
      zoneId,
      '150.00',
      'COD',
      'Invalid row',
      1,
    ]);
    // Exercise the real HTTP limit, not just a tiny compressed template.
    book
      .addWorksheet('Fixture padding')
      .addRows(
        Array.from({ length: 100 }, () => [randomBytes(1000).toString('hex')]),
      );
    const fileBase64 = Buffer.from(await book.xlsx.writeBuffer()).toString(
      'base64',
    );
    expect(fileBase64.length).toBeGreaterThan(102400);
    const preview = data(
      await post('/merchant/imports/preview').send({ fileBase64 }).expect(201),
    );
    expect(preview).toMatchObject({ validCount: 1, invalidCount: 1 });
    await post('/merchant/imports/preview')
      .send({ fileBase64: 'A'.repeat(2100001) })
      .expect(413);
    // The import exception must not raise the body limit on authentication routes.
    await api()
      .post('/auth/signin')
      .send({ email: 'fixture@example.invalid', password: 'A'.repeat(110000) })
      .expect(413);
    const input = { idempotencyKey: randomUUID() };
    const confirmed = data(
      await post(`/merchant/imports/${text(preview.importId)}/confirm`)
        .send(input)
        .expect(201),
    );
    expect(confirmed).toMatchObject({ created: 1, rejected: 1, duplicates: 0 });
    expect(
      data(
        await post(`/merchant/imports/${text(preview.importId)}/confirm`)
          .send(input)
          .expect(201),
      ),
    ).toEqual(confirmed);
    expect(data(await get('/merchant/parcels').expect(200)).items).toHaveLength(
      1,
    );
    await post(
      `/merchant/imports/${text(preview.importId)}/confirm`,
      secondOwner,
    )
      .send({ idempotencyKey: randomUUID() })
      .expect(404);
  });
  it('collects exactly150, posts fee15 once and exposes135 for settlement only after company remittance', async () => {
    let row = await createParcel();
    row = entity(
      await post(`/parcels/${text(row.id)}/transition`, admin)
        .send({ revision: row.revision, status: 'RECEIVED_FROM_MERCHANT' })
        .expect(201),
      'parcel',
    );
    row = entity(
      await post(`/parcels/${text(row.id)}/assignment`, admin)
        .send({ revision: row.revision, workerId: driverId })
        .expect(201),
      'parcel',
    );
    row = entity(
      await post(`/parcels/${text(row.id)}/transition`, admin)
        .send({ revision: row.revision, status: 'OUT_FOR_DELIVERY' })
        .expect(201),
      'parcel',
    );
    await post(`/parcels/${text(row.id)}/attempts`, admin)
      .send({ revision: row.revision, outcome: 'DELIVERED' })
      .expect(201);
    await post('/collections', admin)
      .send({
        parcelId: row.id,
        amount: '165.00',
        method: 'CASH',
        idempotencyKey: randomUUID(),
      })
      .expect(400);
    const input = {
      parcelId: row.id,
      amount: '150.00',
      method: 'CASH',
      idempotencyKey: randomUUID(),
    };
    const collection = entity(
      await post('/collections', admin).send(input).expect(201),
      'collection',
    );
    expect(collection).toMatchObject({
      amount: '150.00',
      goodsAmount: '150.00',
    });
    expect(
      entity(
        await post('/collections', admin).send(input).expect(201),
        'collection',
      ).id,
    ).toBe(collection.id);
    await post(`/collections/${text(collection.id)}/remittance`, admin)
      .send({ amount: '150.00', method: 'CASH', idempotencyKey: randomUUID() })
      .expect(201);
    expect(
      entity(
        await post('/settlements/preview', admin)
          .send({ merchantId, currency: 'ILS' })
          .expect(201),
        'preview',
      ),
    ).toMatchObject({
      grossCollected: '150.00',
      deliveryFees: '15.00',
      netPayable: '135.00',
    });
    expect(
      await prisma.db.orm.public.MerchantLedgerEntry.where({
        companyId,
        merchantId,
        kind: 'DELIVERY_FEE',
      }).all(),
    ).toHaveLength(1);
  });
  it('supports edit-only permissions, blocks zone/city mismatch, and serializes duplicate creation and stale edits', async () => {
    const input = await parcelInput();
    await post('/merchant/parcels')
      .send({ ...input, city: 'Wrong city', idempotencyKey: randomUUID() })
      .expect(400);
    const creations = await Promise.all([
      post('/merchant/parcels').send(input),
      post('/merchant/parcels').send(input),
    ]);
    expect(creations.map((r) => r.status)).toEqual([201, 201]);
    const row = entity(creations[0], 'parcel');
    expect(entity(creations[1], 'parcel').id).toBe(row.id);
    const employee = await activate(merchantId, ['PARCEL_EDIT']);
    const edit = {
      ...(await parcelInput('150.00', employee)),
      revision: row.revision,
      destination: 'New fixture destination',
      recipientPhone: '+000000009',
      description: 'Updated fixture goods',
    };
    const edits = await Promise.all([
      api()
        .patch(`/merchant/parcels/${text(row.id)}`)
        .set('Authorization', `Bearer ${employee}`)
        .send(edit),
      api()
        .patch(`/merchant/parcels/${text(row.id)}`)
        .set('Authorization', `Bearer ${employee}`)
        .send(edit),
    ]);
    expect(edits.map((r) => r.status).sort()).toEqual([200, 409]);
    const audit = await prisma.db.orm.public.ShipmentHistory.where({
      shipmentId: text(row.id),
      event: 'MERCHANT_PARCEL_EDITED',
    }).first();
    const changes = object(JSON.parse(text(audit?.note)));
    expect(object(changes.before)).toMatchObject({
      recipientPhone: row.recipientPhone,
      description: row.description,
    });
    expect(object(changes.after)).toMatchObject({
      recipientPhone: '+000000009',
      description: 'Updated fixture goods',
    });
    expect(audit?.actorId).toBe(jwt.decode<{ sub: string }>(employee).sub);
    await get(`/merchant/parcels/${text(row.id)}`, employee).expect(403);
    const updated = entity(
      await get(`/merchant/parcels/${text(row.id)}`).expect(200),
      'parcel',
    );
    await post(`/merchant/parcels/${text(row.id)}/cancel`)
      .send({
        revision: updated.revision,
        reason: 'Merchant cancelled before receipt',
      })
      .expect(201);
    expect(
      entity(
        await get(`/merchant/parcels/${text(row.id)}`).expect(200),
        'parcel',
      ).status,
    ).toBe('CANCELLED');
  });
  it('requires an auditable company pricing approval after receipt and routes cancellation through controlled returns', async () => {
    let row = await createParcel();
    row = entity(
      await post(`/parcels/${text(row.id)}/transition`, admin)
        .send({ revision: row.revision, status: 'RECEIVED_FROM_MERCHANT' })
        .expect(201),
      'parcel',
    );
    const proposal = {
      ...(await parcelInput('180.00')),
      revision: row.revision,
      reason: 'Recipient requested a new address',
      destination: 'Amended fixture address',
    };
    const request = entity(
      await post(`/merchant/parcels/${text(row.id)}/amendment-requests`)
        .send(proposal)
        .expect(201),
      'request',
    );
    expect(
      entity(
        await get(`/merchant/parcels/${text(row.id)}`).expect(200),
        'parcel',
      ),
    ).toMatchObject({
      destination: 'Fixture customer address',
      finalCustomerAmount: '150.00',
    });
    await get(`/parcel-requests/${text(request.id)}`, foreignAdmin).expect(404);
    await post(`/parcel-requests/${text(request.id)}/review`)
      .send({
        action: 'APPROVE',
        parcelRevision: row.revision,
        pricingVersion: proposal.pricingVersion,
        reason: 'Forged merchant approval',
      })
      .expect(403);
    const preview = data(
      await get(`/parcel-requests/${text(request.id)}`, admin).expect(200),
    );
    expect(preview).toMatchObject({
      previousFee: '15.00',
      proposedFee: '15.00',
      pricing: expect.objectContaining({
        finalCustomerAmount: '180.00',
        expectedMerchantProceeds: '165.00',
      }),
    });
    await post(`/parcel-requests/${text(request.id)}/review`, admin)
      .send({
        action: 'APPROVE',
        parcelRevision: row.revision,
        pricingVersion: '0'.repeat(64),
        reason: 'Stale quote must fail',
      })
      .expect(409);
    await post(`/parcel-requests/${text(request.id)}/review`, admin)
      .send({
        action: 'APPROVE',
        parcelRevision: row.revision,
        pricingVersion: object(preview.pricing).pricingVersion,
        reason: 'Company reviewed price and destination',
      })
      .expect(201);
    row = entity(
      await get(`/merchant/parcels/${text(row.id)}`).expect(200),
      'parcel',
    );
    expect(row).toMatchObject({
      finalCustomerAmount: '180.00',
      destination: 'Amended fixture address',
      status: 'RECEIVED_FROM_MERCHANT',
    });
    const cancellation = entity(
      await post(`/merchant/parcels/${text(row.id)}/cancellation-requests`)
        .send({
          revision: row.revision,
          reason: 'Merchant requested return',
          idempotencyKey: randomUUID(),
        })
        .expect(201),
      'request',
    );
    await post(`/parcel-requests/${text(cancellation.id)}/review`, admin)
      .send({
        action: 'APPROVE',
        parcelRevision: row.revision,
        reason: 'Company accepted documented return',
      })
      .expect(201);
    expect(
      entity(
        await get(`/merchant/parcels/${text(row.id)}`).expect(200),
        'parcel',
      ),
    ).toMatchObject({ status: 'RETURN_IN_PROGRESS', custody: 'COMPANY' });
    expect(
      await prisma.db.orm.public.ParcelReturn.where({
        companyId,
        shipmentId: text(row.id),
      }).first(),
    ).toMatchObject({ reason: 'MERCHANT_REQUESTED' });
    expect(
      await prisma.db.orm.public.CodCollection.where({
        companyId,
        shipmentId: text(row.id),
      }).all(),
    ).toEqual([]);
    const history = await prisma.ShipmentHistory.where({
      shipmentId: text(row.id),
    }).all();
    expect(
      history.filter((h) => h.event === 'MERCHANT_REQUEST_APPROVED'),
    ).toHaveLength(2);
  });
  it('allows rejecting an unpriceable amendment without silently applying unavailable terms', async () => {
    let row = await createParcel();
    row = entity(
      await post(`/parcels/${text(row.id)}/transition`, admin)
        .send({ revision: row.revision, status: 'RECEIVED_FROM_MERCHANT' })
        .expect(201),
      'parcel',
    );
    const proposal = {
      ...(await parcelInput('180.00')),
      revision: row.revision,
      reason: 'Fixture address correction',
    };
    const pending = entity(
      await post(`/merchant/parcels/${text(row.id)}/amendment-requests`)
        .send(proposal)
        .expect(201),
      'request',
    );
    await prisma.db.orm.public.MerchantPlan.where({
      id: planId,
      companyId,
    }).update({ active: false });
    expect(
      data(
        await get(`/parcel-requests/${text(pending.id)}`, admin).expect(200),
      ),
    ).toMatchObject({
      pricing: null,
      pricingUnavailable: true,
      canApprove: false,
    });
    await post(`/parcel-requests/${text(pending.id)}/review`, admin)
      .send({
        action: 'APPROVE',
        parcelRevision: row.revision,
        pricingVersion: proposal.pricingVersion,
        reason: 'Unavailable terms must not be applied',
      })
      .expect(400);
    await post(`/parcel-requests/${text(pending.id)}/review`, admin)
      .send({
        action: 'REJECT',
        parcelRevision: row.revision,
        reason: 'Commercial plan is unavailable',
      })
      .expect(201);
    expect(
      entity(
        await get(`/merchant/parcels/${text(row.id)}`).expect(200),
        'parcel',
      ),
    ).toMatchObject({ finalCustomerAmount: '150.00', revision: row.revision });
  });
  it('lists settlement request history with reviewed status, stable pagination and public fields only', async () => {
    const requested = entity(
      await post('/merchant/settlement-requests')
        .send({
          currency: 'ILS',
          notes: 'First request',
          idempotencyKey: randomUUID(),
        })
        .expect(201),
      'request',
    );
    await post(
      `/merchant-settlement-requests/${text(requested.id)}/review`,
      admin,
    )
      .send({})
      .expect(201);
    const latest = entity(
      await post('/merchant/settlement-requests')
        .send({ currency: 'USD', idempotencyKey: randomUUID() })
        .expect(201),
      'request',
    );
    const first = await get(
      '/merchant/settlement-requests?page=1&pageSize=1',
    ).expect(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(data(first)).toEqual({
      items: [
        {
          id: latest.id,
          currency: 'USD',
          notes: null,
          status: 'REQUESTED',
          createdAt: expect.any(String),
        },
      ],
      page: 1,
      pageSize: 1,
      hasNext: true,
    });
    expect(
      data(
        await get('/merchant/settlement-requests?page=2&pageSize=1').expect(
          200,
        ),
      ),
    ).toEqual({
      items: [
        {
          id: requested.id,
          currency: 'ILS',
          notes: 'First request',
          status: 'REVIEWED',
          createdAt: expect.any(String),
        },
      ],
      page: 2,
      pageSize: 1,
      hasNext: false,
    });
    await get('/merchant/settlement-requests?page=0').expect(400);
    await get('/merchant/settlement-requests?pageSize=101').expect(400);
  });
  it('isolates settlement request history by persisted merchant and company', async () => {
    const own = entity(
      await post('/merchant/settlement-requests')
        .send({ currency: 'ILS', idempotencyKey: randomUUID() })
        .expect(201),
      'request',
    );
    const other = entity(
      await post('/merchant/settlement-requests', secondOwner)
        .send({ currency: 'USD', idempotencyKey: randomUUID() })
        .expect(201),
      'request',
    );
    const foreign = jwt.decode<{ sub: string; orgId: string }>(foreignAdmin);
    await prisma.db.orm.public.MerchantSettlementRequest.create({
      companyId: foreign.orgId,
      merchantId: await merchant(foreignAdmin),
      requestedBy: foreign.sub,
      currency: 'EUR',
    });
    expect(
      data(await get('/merchant/settlement-requests').expect(200)).items,
    ).toEqual([expect.objectContaining({ id: own.id })]);
    expect(
      data(await get('/merchant/settlement-requests', secondOwner).expect(200))
        .items,
    ).toEqual([expect.objectContaining({ id: other.id })]);
    await get('/merchant/settlement-requests', admin).expect(403);
    await api().get('/merchant/settlement-requests').expect(401);
  });
  it('requires current FINANCE_VIEW membership for settlement request history', async () => {
    const denied = await activate(merchantId, ['PARCEL_VIEW']);
    await get('/merchant/settlement-requests', denied).expect(403);
    const allowed = await activate(merchantId, ['FINANCE_VIEW']);
    expect(
      data(await get('/merchant/settlement-requests', allowed).expect(200))
        .items,
    ).toEqual([]);
    const member = jwt.decode<{ sub: string }>(allowed);
    await prisma.db.orm.public.MerchantMembership.where({
      userId: member.sub,
      companyId,
    }).update({ status: 'REVOKED' });
    await get('/merchant/settlement-requests', allowed).expect(403);
  });
  it('records settlement requests separately from payments and scopes company review', async () => {
    const input = {
      currency: 'ILS',
      notes: 'Fixture merchant asks for a statement review',
      idempotencyKey: randomUUID(),
    };
    const requested = entity(
      await post('/merchant/settlement-requests').send(input).expect(201),
      'request',
    );
    expect(requested.status).toBe('REQUESTED');
    expect(
      entity(
        await post('/merchant/settlement-requests').send(input).expect(201),
        'request',
      ).id,
    ).toBe(requested.id);
    expect(
      data(await get('/merchant-settlement-requests', foreignAdmin).expect(200))
        .items,
    ).toEqual([]);
    await post(
      `/merchant-settlement-requests/${text(requested.id)}/review`,
      foreignAdmin,
    )
      .send({})
      .expect(404);
    expect(
      data(await get('/merchant-settlement-requests', admin).expect(200)).items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: requested.id, merchantId }),
      ]),
    );
    await post('/merchant/settlement-requests')
      .send({ ...input, idempotencyKey: randomUUID() })
      .expect(201);
    const firstPage = data(
      await get(
        '/merchant-settlement-requests?page=1&pageSize=1',
        admin,
      ).expect(200),
    );
    const secondPage = data(
      await get(
        '/merchant-settlement-requests?page=2&pageSize=1',
        admin,
      ).expect(200),
    );
    expect(firstPage.hasNext).toBe(true);
    expect(secondPage.hasNext).toBe(false);
    expect(firstPage.items).toHaveLength(1);
    expect(secondPage.items).toHaveLength(1);
    expect(firstPage.items).not.toEqual(secondPage.items);
    await get('/merchant-settlement-requests?page=0', admin).expect(400);
    await post(
      `/merchant-settlement-requests/${text(requested.id)}/review`,
      admin,
    )
      .send({})
      .expect(201);
    expect(
      await prisma.db.orm.public.SettlementPayment.where({ companyId }).all(),
    ).toEqual([]);
  });
  it('verifies the canonical Flutter merchant app through real NestJS, PostgreSQL and company dashboard without API mocks', async () => {
    await guard.verify(() => readAuthPostgresIdentity(prisma));
    const administrator = jwt.decode<{ sub: string; email: string }>(admin),
      merchant = jwt.decode<{ email: string }>(owner);
    await prisma.User.where({ id: administrator.sub, companyId }).update({
      password: await bcrypt.hash(password, 4),
    });
    if (!app.getHttpServer().listening) await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string')
      throw new Error('Disposable backend address unavailable');
    const output = await verifyMerchantBrowser({
      backendPort: address.port,
      merchantEmail: merchant.email,
      adminEmail: administrator.email,
      password,
      zoneLabel: 'Fixture city · Fixture neighborhood',
    });
    const actual = await prisma.Shipment.where({
      companyId,
      merchantId,
      recipientName: 'Browser verified recipient',
    }).first();
    expect(actual).toMatchObject({
      codMinor: 15000n,
      deliveryFeeMinor: 1500n,
      status: 'CREATED',
      custody: 'MERCHANT',
    });
    console.log(`Real Flutter merchant browser verification: ${output}`);
  }, 600000);
  if (process.env.FLEETORA_ANDROID_DEVICE) {
    it('verifies native Android with the real owned PostgreSQL backend', async () => {
      await guard.verify(() => readAuthPostgresIdentity(prisma));
      const merchant = jwt.decode<{
        sub: string;
        orgId: string;
        role: string;
        email: string;
      }>(owner);
      const payload = {
        sub: merchant.sub,
        orgId: merchant.orgId,
        role: merchant.role,
        email: merchant.email,
      };
      if (!app.getHttpServer().listening) await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address();
      if (!address || typeof address === 'string')
        throw new Error('Disposable backend address unavailable');
      let workbookBase64: string | undefined;
      if (process.env.FLEETORA_ANDROID_PICKER === '1') {
        const template = data(
          await get('/merchant/imports/template').expect(200),
        );
        const book = new Workbook();
        await book.xlsx.load(
          Uint8Array.from(Buffer.from(text(template.fileBase64), 'base64'))
            .buffer,
        );
        const sheet = book.getWorksheet('Parcels');
        if (!sheet) throw new Error('Owned workbook template missing');
        sheet.addRow([
          'Android imported recipient',
          '+000000005',
          '',
          'Fixture city',
          'Android isolated import destination',
          zoneId,
          '150.00',
          'COD',
          'Android import goods',
          1,
        ]);
        workbookBase64 = Buffer.from(await book.xlsx.writeBuffer()).toString(
          'base64',
        );
      }
      const output = await verifyMerchantAndroid({
        backendPort: address.port,
        merchantEmail: merchant.email,
        password,
        zoneLabel: 'Fixture city · Fixture neighborhood',
        expiredAccessToken: await jwt.signAsync(payload, { expiresIn: '-1s' }),
        expiredRefreshToken: await jwt.signAsync(payload, {
          secret: configuration.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
          expiresIn: '-1s',
        }),
        workbookBase64,
      });
      const rows = await prisma.Shipment.where({ companyId, merchantId }).all();
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            recipientName: 'Android verified recipient',
            latitude: output.selectedLocation.latitude,
            longitude: output.selectedLocation.longitude,
            codMinor: 15000n,
            deliveryFeeMinor: 1500n,
            status: 'CREATED',
            custody: 'MERCHANT',
          }),
          expect.objectContaining({
            recipientName: 'Android prepaid recipient',
            codMinor: 0n,
            deliveryFeeMinor: 1500n,
            status: 'CREATED',
            custody: 'MERCHANT',
          }),
        ]),
      );
      expect(
        await get('/merchant/parcels', secondOwner).expect(200).then(data),
      ).toMatchObject({ items: [] });
      expect(data(await get('/merchant/pickups').expect(200)).items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'WAREHOUSE_DROPOFF',
            status: 'REQUESTED',
          }),
        ]),
      );
      const created = rows.find(
        (row) => row.recipientName === 'Android verified recipient',
      );
      if (!created) throw new Error('Native fixture parcel was not persisted');
      expect(
        entity(
          await get(`/merchant/parcels/${created.id}`).expect(200),
          'parcel',
        ),
      ).toMatchObject(output.selectedLocation);
      await get(`/parcels/${created.id}`, foreignAdmin).expect(404);
      console.log(`Real native Android verification: ${output.output}`);
    }, 1500000);
  }
  afterAll(async () => {
    await guard.teardown(
      async () => {
        await guard.verify(() => readAuthPostgresIdentity(prisma));
        for (const id of companies) {
          const orm = prisma.db.orm.public;
          await orm.MerchantParcelRequest.where({ companyId: id }).deleteAll();
          await orm.PickupParcel.where({ companyId: id }).deleteAll();
          await orm.PickupRequest.where({ companyId: id }).deleteAll();
          await orm.MerchantImport.where({ companyId: id }).deleteAll();
          await orm.MerchantSettlementRequest.where({
            companyId: id,
          }).deleteAll();
          await orm.SettlementPayment.where({ companyId: id }).deleteAll();
          await orm.SettlementAllocation.where({ companyId: id }).deleteAll();
          await orm.MerchantSettlementLine.where({ companyId: id }).deleteAll();
          await orm.MerchantSettlement.where({ companyId: id }).deleteAll();
          await orm.MerchantLedgerEntry.where({ companyId: id }).deleteAll();
          await orm.CashRemittance.where({ companyId: id }).deleteAll();
          await orm.CodCollection.where({ companyId: id }).deleteAll();
          await orm.ParcelAttempt.where({ companyId: id }).deleteAll();
          await orm.ParcelReturn.where({ companyId: id }).deleteAll();
          await prisma.ShipmentHistory.where((h) =>
            h.shipment.some((s) => s.companyId.eq(id)),
          ).deleteAll();
          await prisma.Shipment.where({ companyId: id }).deleteAll();
          await orm.MerchantAccessEvent.where({ companyId: id }).deleteAll();
          await orm.MerchantInvitation.where({ companyId: id }).deleteAll();
          await orm.MerchantMembership.where({ companyId: id }).deleteAll();
          await orm.Merchant.where({ companyId: id }).deleteAll();
          await orm.PlanZoneTariff.where({ companyId: id }).deleteAll();
          await orm.MerchantPlan.where({ companyId: id }).deleteAll();
          await orm.DeliveryZone.where({ companyId: id }).deleteAll();
          await orm.MonetaryRequest.where({ companyId: id }).deleteAll();
          await prisma.Worker.where({ companyId: id }).deleteAll();
          await prisma.Warehouse.where({ companyId: id }).deleteAll();
          await prisma.User.where({ companyId: id }).deleteAll();
          await prisma.Company.where({ id }).delete();
        }
      },
      async () => {
        await app?.close();
        await prisma?.db.close();
      },
    );
  });
});
