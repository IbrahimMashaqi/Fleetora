import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  VehicleInputDto,
  AssignmentDto,
  VehicleQueryDto,
  normalizeManufacturer,
} from './vehicles.dto.js';

describe('vehicle input contracts', () => {
  it.each([
    ['Mercedes', 'Mercedes-Benz'],
    ['MERCEDES BENZ', 'Mercedes-Benz'],
    ['Škoda', 'Škoda'],
    ['SKODA', 'Škoda'],
    ['B.M.W.', 'BMW'],
    ['VW', 'Volkswagen'],
    ['Acme Motors', 'Acme Motors'],
  ])('normalizes %s without inventing unknown brands', (input, expected) =>
    expect(normalizeManufacturer(input)).toBe(expected),
  );
  it('keeps nullable legacy identity and normalizes plates', async () => {
    const dto = plainToInstance(VehicleInputDto, {
      manufacturer: null,
      model: null,
      type: 'CAR',
      plateNumber: ' demo-42 ',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.plateNumber).toBe('DEMO-42');
  });
  it.each([
    { type: 'OTHER', plateNumber: 'ABC' },
    { type: 'CAR', plateNumber: ' ' },
    { type: 'CAR', plateNumber: 'A'.repeat(33) },
    { type: 'CAR', plateNumber: 'ABC', manufacturer: 42 },
    { type: 'CAR', plateNumber: 'ABC', model: 'x'.repeat(101) },
  ])('rejects invalid vehicle fields', async (input) =>
    expect(
      (await validate(plainToInstance(VehicleInputDto, input))).length,
    ).toBeGreaterThan(0),
  );
  it('requires both assignment fields, accepting explicit null', async () => {
    expect(
      await validate(
        plainToInstance(AssignmentDto, {
          vehicleId: null,
          expectedVehicleId: null,
        }),
      ),
    ).toEqual([]);
    expect(
      (await validate(plainToInstance(AssignmentDto, {}))).length,
    ).toBeGreaterThan(0);
  });
  it('rejects unsupported query booleans and pagination', async () => {
    expect(
      (
        await validate(
          plainToInstance(VehicleQueryDto, { unassigned: 'yes', page: '0' }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      await validate(
        plainToInstance(VehicleQueryDto, { unassigned: 'true', page: '2' }),
      ),
    ).toEqual([]);
  });
});
