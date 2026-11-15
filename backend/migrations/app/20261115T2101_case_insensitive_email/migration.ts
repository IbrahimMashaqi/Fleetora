#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/9f414f76d4fb32c1e38dc21b1246d1b70af9d69df308c3264ebc0e38b7162d11/contract';
import startContract from '../../snapshots/9f414f76d4fb32c1e38dc21b1246d1b70af9d69df308c3264ebc0e38b7162d11/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f3715185aafae91ad66bca609d42540daa21b5b2aeef17f6a8e7688711482eac/contract';
import endContract from '../../snapshots/f3715185aafae91ad66bca609d42540daa21b5b2aeef17f6a8e7688711482eac/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Refuse to run while case-variant duplicates exist. Accounts are never merged,
      // rewritten or deleted here; an operator must resolve them deliberately first.
      // The message names no address; find them with:
      //   SELECT lower(email), count(*) FROM users WHERE email IS NOT NULL
      //   GROUP BY lower(email) HAVING count(*) > 1;
      rawSql({
        id: 'guard.users.email_case_collisions',
        label: 'Require no case-insensitive email collisions in "users"',
        operationClass: 'additive',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'users' },
        },
        precheck: [
          {
            description:
              'ensure no two users share an email that differs only by letter case (resolve manually before migrating)',
            sql: 'SELECT NOT EXISTS (SELECT 1 FROM "public"."users" WHERE "email" IS NOT NULL GROUP BY lower("email") HAVING count(*) > 1) AS "result"',
            params: [],
          },
        ],
        execute: [],
        postcheck: [],
      }),
      this.createIndex({
        schema: 'public',
        table: 'users',
        index: 'users_email_lower_f84d49fd',
        expression: 'lower(email)',
        extras: { unique: true },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
