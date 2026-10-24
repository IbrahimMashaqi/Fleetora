import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash, randomUUID } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import { inflateRawSync } from 'node:zlib';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { MerchantPortalStore } from './merchant-portal.store.js';
import { MerchantParcelsService } from './merchant-parcels.service.js';
import { MerchantParcelDto } from './merchant-portal.dto.js';
import { MerchantPricingService } from '../merchant-pricing/merchant-pricing.service.js';
import { json } from './merchant-json.js';
const columns = [
  'recipientName',
  'recipientPhone',
  'secondaryPhone',
  'city',
  'destination',
  'zoneId',
  'finalCustomerAmount',
  'collectionMode',
  'description',
  'pieces',
  'merchantReference',
  'notes',
] as const;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
// Bound ZIP expansion before handing uploaded data to the workbook parser.
export function validateWorkbookArchive(bytes: Buffer) {
  if (bytes.length > 1500000 || bytes.length < 22)
    throw new BadRequestException('Workbook must be smaller than 1.5 MB');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0)
    throw new BadRequestException('A valid .xlsx workbook is required');
  const entries = bytes.readUInt16LE(end + 10),
    start = bytes.readUInt32LE(end + 16);
  if (
    !entries ||
    entries > 200 ||
    start >= end ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0
  )
    throw new BadRequestException('Unsupported workbook archive');
  let cursor = start,
    expanded = 0;
  for (let i = 0; i < entries; i++) {
    if (
      cursor + 46 > end ||
      bytes.readUInt32LE(cursor) !== 0x02014b50 ||
      bytes.readUInt16LE(cursor + 8) & 1
    )
      throw new BadRequestException('Unsupported workbook archive');
    const declared = bytes.readUInt32LE(cursor + 24),
      compressed = bytes.readUInt32LE(cursor + 20);
    const local = bytes.readUInt32LE(cursor + 42),
      method = bytes.readUInt16LE(cursor + 10);
    if (
      local + 30 > start ||
      bytes.readUInt32LE(local) !== 0x04034b50 ||
      ![0, 8].includes(method)
    )
      throw new BadRequestException('Unsupported workbook entry');
    const offset =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    if (offset + compressed > start || declared > 8000000 - expanded)
      throw new BadRequestException('Workbook expands beyond the import limit');
    try {
      const raw = bytes.subarray(offset, offset + compressed);
      const actual =
        method === 0
          ? raw.length
          : inflateRawSync(raw, {
              maxOutputLength: Math.max(1, 8000000 - expanded),
            }).length;
      if (actual !== declared || actual > 8000000 - expanded)
        throw new Error('Invalid expanded entry size');
      expanded += actual;
    } catch {
      throw new BadRequestException(
        'Workbook expands beyond the import limit or contains invalid compressed data',
      );
    }
    cursor +=
      46 +
      bytes.readUInt16LE(cursor + 28) +
      bytes.readUInt16LE(cursor + 30) +
      bytes.readUInt16LE(cursor + 32);
    if (cursor > end) throw new BadRequestException('Invalid workbook archive');
  }
}
@Injectable()
export class MerchantImportsService {
  constructor(
    @Inject(MerchantPortalStore) private readonly store: MerchantPortalStore,
    @Inject(MerchantParcelsService)
    private readonly parcels: MerchantParcelsService,
    @Inject(MerchantPricingService)
    private readonly pricing: MerchantPricingService,
  ) {}
  async template(actor: TokenPayload) {
    await this.store.access.resolve(actor, 'PARCEL_IMPORT');
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Parcels');
    sheet.addRow([...columns]);
    columns.forEach((_, i) => {
      sheet.getColumn(i + 1).numFmt = '@';
      sheet.getColumn(i + 1).width = 24;
    });
    const notes = book.addWorksheet('Instructions');
    notes.addRows([
      ['Maximum 200 parcels. Keep monetary amounts and phone numbers as text.'],
      ['finalCustomerAmount is the FINAL customer payment including delivery.'],
      ['collectionMode: COD for a positive amount; PREPAID for zero.'],
      [
        'zoneId must be one of your delivery company zones. No formulas or links.',
      ],
      [
        'Preview validates each row; confirmation creates only valid rows atomically.',
      ],
    ]);
    return {
      filename: 'fleetora-merchant-parcels.xlsx',
      fileBase64: Buffer.from(await book.xlsx.writeBuffer()).toString('base64'),
    };
  }
  async preview(actor: TokenPayload, fileBase64: string) {
    const context = await this.store.access.resolve(actor, 'PARCEL_IMPORT');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(fileBase64) || fileBase64.length % 4)
      throw new BadRequestException('Invalid file encoding');
    const bytes = Buffer.from(fileBase64, 'base64');
    validateWorkbookArchive(bytes);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
    } catch {
      throw new BadRequestException('Workbook could not be read');
    }
    const sheet = workbook.getWorksheet('Parcels') ?? workbook.worksheets[0];
    if (
      !sheet ||
      sheet.rowCount < 2 ||
      sheet.rowCount > 201 ||
      sheet.columnCount > columns.length
    )
      throw new BadRequestException(
        'Import requires 1–200 parcel rows using the supplied template',
      );
    if (
      !columns.every((name, i) => sheet.getRow(1).getCell(i + 1).value === name)
    )
      throw new BadRequestException('Use the supplied workbook headers');
    const rows: {
      rowNumber: number;
      errors: string[];
      input?: MerchantParcelDto;
      preview?: Awaited<ReturnType<MerchantPricingService['quote']>>['preview'];
    }[] = [];
    for (let number = 2; number <= sheet.rowCount; number++) {
      const row = sheet.getRow(number),
        values: Record<string, unknown> = {};
      const errors: string[] = [];
      columns.forEach((name, i) => {
        const value = row.getCell(i + 1).value;
        if (value === null || value === undefined || value === '') return;
        if (
          name === 'pieces' &&
          (typeof value === 'string' || typeof value === 'number')
        )
          values[name] = Number(value);
        else if (typeof value === 'string') values[name] = value.trim();
        else
          errors.push(
            `${name}: use plain text, not formulas, links or numbers`,
          );
      });
      const input = plainToInstance(MerchantParcelDto, {
        pieces: 1,
        ...values,
        pricingVersion: '0'.repeat(64),
        idempotencyKey: randomUUID(),
      });
      const invalid = await validate(input, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      errors.push(
        ...invalid.map(
          (e) =>
            `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
        ),
      );
      let preview;
      if (!errors.length) {
        try {
          const quote = await this.pricing.quote(
            context.companyId,
            context.merchantId,
            input.zoneId,
            input.finalCustomerAmount,
          );
          if (
            (input.collectionMode === 'PREPAID') !==
            (quote.snapshot.codMinor === 0n)
          )
            errors.push('collectionMode does not match customer payment');
          preview = quote.preview;
          input.pricingVersion = quote.preview.pricingVersion;
        } catch (error) {
          if (
            error instanceof BadRequestException ||
            error instanceof NotFoundException
          )
            errors.push(
              'Zone or commercial pricing is unavailable for this row',
            );
          else throw error;
        }
      }
      rows.push({
        rowNumber: number,
        errors,
        ...(!errors.length ? { input, preview } : {}),
      });
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    const id = await this.store.write(
      actor,
      'PARCEL_IMPORT',
      async (tx, current) => {
        const previous = await tx.orm.public.MerchantImport.where({
          companyId: current.companyId,
          merchantId: current.merchantId,
          digest,
        }).first();
        if (previous) {
          if (!previous.confirmedAt)
            await tx.orm.public.MerchantImport.where({
              id: previous.id,
              companyId: current.companyId,
              merchantId: current.merchantId,
            }).update({
              rows: json(rows),
              expiresAt: Temporal.Now.instant().add({ hours: 24 }),
            });
          return previous.id;
        }
        return (
          await tx.orm.public.MerchantImport.create({
            companyId: current.companyId,
            merchantId: current.merchantId,
            createdBy: current.userId,
            digest,
            rows: json(rows),
            expiresAt: Temporal.Now.instant().add({ hours: 24 }),
          })
        ).id;
      },
    );
    return this.readPreview(actor, id);
  }
  private async readPreview(actor: TokenPayload, id: string) {
    const context = await this.store.access.resolve(actor, 'PARCEL_IMPORT');
    const batch = await this.store.orm.MerchantImport.where({
      id,
      companyId: context.companyId,
      merchantId: context.merchantId,
    }).first();
    if (!batch || !Array.isArray(batch.rows))
      throw new NotFoundException('Import not found');
    const validCount = batch.rows.filter(
      (r) => object(r) && Array.isArray(r.errors) && r.errors.length === 0,
    ).length;
    return {
      importId: id,
      rows: batch.rows.map((r) =>
        object(r)
          ? { rowNumber: r.rowNumber, errors: r.errors, preview: r.preview }
          : null,
      ),
      validCount,
      invalidCount: batch.rows.length - validCount,
      confirmed: !!batch.confirmedAt,
    };
  }
  async confirm(actor: TokenPayload, id: string, idempotencyKey: string) {
    await this.store.write(actor, 'PARCEL_IMPORT', (tx, context) =>
      this.store.idempotent(
        tx,
        context,
        idempotencyKey,
        `IMPORT_CONFIRM:${id}`,
        {},
        async () => {
          const batch = await tx.orm.public.MerchantImport.where({
            id,
            companyId: context.companyId,
            merchantId: context.merchantId,
          }).first();
          if (!batch) throw new NotFoundException('Import not found');
          if (batch.confirmedAt) return batch.id;
          if (
            Temporal.Instant.compare(batch.expiresAt, Temporal.Now.instant()) <=
            0
          )
            throw new ConflictException(
              'Import preview expired; upload the file again',
            );
          if (!Array.isArray(batch.rows))
            throw new ConflictException('Import data is invalid');
          const parcels: string[] = [];
          for (const row of batch.rows) {
            if (
              !object(row) ||
              !Array.isArray(row.errors) ||
              row.errors.length ||
              !object(row.input)
            )
              continue;
            const input = plainToInstance(MerchantParcelDto, row.input);
            if (
              (
                await validate(input, {
                  whitelist: true,
                  forbidNonWhitelisted: true,
                })
              ).length
            )
              throw new ConflictException('Import data failed revalidation');
            parcels.push((await this.parcels.createIn(tx, context, input)).id);
          }
          if (!parcels.length)
            throw new BadRequestException('No valid rows to import');
          await tx.orm.public.MerchantImport.where({
            id,
            companyId: context.companyId,
            merchantId: context.merchantId,
          }).update({
            confirmedAt: Temporal.Now.instant(),
            result: {
              created: parcels.length,
              rejected: batch.rows.length - parcels.length,
              duplicates: 0,
              parcels,
            },
          });
          return batch.id;
        },
      ),
    );
    const context = await this.store.access.resolve(actor, 'PARCEL_IMPORT');
    const batch = await this.store.orm.MerchantImport.where({
      id,
      companyId: context.companyId,
      merchantId: context.merchantId,
    }).first();
    return batch?.result;
  }
}
