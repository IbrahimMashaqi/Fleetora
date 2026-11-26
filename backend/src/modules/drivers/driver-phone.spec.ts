import { describe, expect, it } from 'vitest';
import { normalizeDriverPhone } from './driver-phone.js';

describe('BR-035 driver phone login identifier', () => {
  for (const [input, expected] of [
    ['0591234567', '+970591234567'],
    ['0561234567', '+970561234567'],
    ['0501234567', '+972501234567'],
    ['0521234567', '+972521234567'],
    ['0541234567', '+972541234567'],
    ['0581234567', '+972581234567'],
    ['+970591234567', '+970591234567'],
    ['00970561234567', '+970561234567'],
    ['+972591234567', '+972591234567'],
    ['00972521234567', '+972521234567'],
    [' 059-123 4567 ', '+970591234567'],
    ['(+970) 59 123 4567', '+970591234567'],
  ])
    it(`normalizes ${input}`, () =>
      expect(normalizeDriverPhone(input)).toBe(expected));
  for (const input of [
    '',
    '059123',
    '+970501234567',
    '+123456789',
    '05912345678',
    '059abc4567',
    '0591234567 ext 2',
    '970591234567',
    '++970591234567',
    '0591234567\nsecret',
  ])
    it(`rejects invalid identifier ${input.length}`, () =>
      expect(() => normalizeDriverPhone(input)).toThrow());
});
