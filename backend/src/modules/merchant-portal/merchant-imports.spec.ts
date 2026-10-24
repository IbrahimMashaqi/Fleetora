import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { Workbook } from 'exceljs';
import { validateWorkbookArchive } from './merchant-imports.service.js';
describe('merchant XLSX upload expansion boundary', () => {
  it('reads a real bounded Excel archive', async () => {
    const workbook = new Workbook();
    workbook.addWorksheet('Parcels').addRow(['recipientName']);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    expect(() => validateWorkbookArchive(bytes)).not.toThrow();
  });
  it('rejects forged ZIP expansion metadata before Excel parsing can inflate beyond the limit', () => {
    const compressed = deflateRawSync(Buffer.alloc(9000000, 65));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(8, 8);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(0, 24);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(46, 12);
    end.writeUInt32LE(local.length + compressed.length, 16);
    expect(() =>
      validateWorkbookArchive(Buffer.concat([local, compressed, central, end])),
    ).toThrow(/expands beyond/);
  });
  it('rejects oversized and malformed uploads', () => {
    expect(() => validateWorkbookArchive(Buffer.alloc(1500001))).toThrow();
    expect(() =>
      validateWorkbookArchive(Buffer.from('not an Excel workbook')),
    ).toThrow();
  });
});
