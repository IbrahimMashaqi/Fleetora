import { ValidateBy, type ValidationOptions } from 'class-validator';

// bcrypt consumes at most 72 UTF-8 bytes. New credentials must never truncate.
export function PasswordByteLimit(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy({
    name: 'passwordByteLimit',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72,
      defaultMessage: () => 'Password must not exceed 72 UTF-8 bytes',
    },
  }, options);
}
