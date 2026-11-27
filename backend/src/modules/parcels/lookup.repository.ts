import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TokenPayload } from '../auth/token/token.payload.js';
import { company } from './parcel-domain.js';
import type { LookupDto } from './lookup.dto.js';
import { normalizeLookupSearch } from './lookup-search.js';
import { vehicleCatalog } from '../vehicles/vehicle-catalog.js';

@Injectable()
export class LookupRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async search(actor: TokenPayload, q: LookupDto) {
    const companyId = company(
      actor,
      ['vehicles', 'vehicleBrands', 'vehicleModels'].includes(q.kind)
        ? 'viewVehicles'
        : q.kind === 'warehouses'
          ? 'viewWarehouses'
          : q.collectable === 'true'
            ? 'collect'
            : 'view',
    );
    const term = normalizeLookupSearch(q.search ?? ''),
      selected = q.selected ?? '';
    const active = q.active === 'true' ? 'true' : 'false';
    const activated = q.activationStatus === 'ACTIVE' ? 'true' : 'false';
    const collectable = q.collectable === 'true' ? 'true' : 'false';
    const limit = term ? 20 : 10;
    if (q.kind === 'vehicleBrands' || q.kind === 'vehicleModels') {
      const key = (text: string) =>
        normalizeLookupSearch(text).normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
      const catalog =
        q.kind === 'vehicleBrands'
          ? vehicleCatalog.map((brand) => ({
              id: `brand:${brand.manufacturer}`,
              label: brand.manufacturer,
              detail: '',
              terms: [brand.manufacturer, ...brand.aliases],
            }))
          : (
              vehicleCatalog.find(
                (brand) =>
                  key(brand.manufacturer) === key(q.manufacturer ?? ''),
              )?.models ?? []
            ).map((model) => ({
              id: `model:${model}`,
              label: model,
              detail: '',
              terms: [model],
            }));
      const choices = [
        {
          id: 'none',
          label: 'Not recorded',
          detail: '',
          terms: ['Not recorded', 'غير مسجل'],
        },
        ...catalog,
        {
          id: 'custom',
          label:
            q.kind === 'vehicleBrands'
              ? 'Other / Custom manufacturer'
              : 'Other / Custom model',
          detail: '',
          terms: ['Other Custom manufacturer model', 'آخر مخصص مصنع طراز'],
        },
      ];
      const option = (row: (typeof choices)[number]) => ({
        id: row.id,
        label: row.label,
        detail: row.detail,
      });
      const selectedRow = choices.find((row) => row.id === selected);
      return {
        companyId,
        items: choices
          .filter((row) =>
            [row.label, ...row.terms].some((text) => key(text).includes(key(term))),
          )
          .slice(0, limit)
          .map(option),
        selected: selectedRow ? option(selectedRow) : null,
      };
    }
    // Fixed SQL and bound values only. Each branch applies tenant and eligibility
    // before searching or resolving a selected value; no pricing/identity fields.
    const rows = await this.prisma.db.runtime().query(
      this.prisma.db.raw.sql`
      WITH candidates AS (
        SELECT v.id, coalesce(v.manufacturer, '') || ' ' || coalesce(v.model, '') AS label, v."plateNumber" AS detail FROM vehicles v
        WHERE ${q.kind}='vehicles' AND v."companyId"=${companyId}
          AND NOT EXISTS (SELECT 1 FROM workers w WHERE w."vehicleId"=v.id)
        UNION ALL
        SELECT id, name AS label, phone AS detail FROM merchants
        WHERE ${q.kind}='merchants' AND "companyId"=${companyId}
          AND (${activated}='false' OR "activationStatus"='ACTIVE')
        UNION ALL
        SELECT id, "fullName", phone FROM workers
        WHERE ${q.kind}='drivers' AND "companyId"=${companyId}
          AND (${active}='false' OR (status<>'SUSPENDED' AND "offboardedAt" IS NULL))
        UNION ALL
        SELECT id, name, city FROM delivery_zones
        WHERE ${q.kind}='zones' AND "companyId"=${companyId} AND active=true
        UNION ALL
        SELECT DISTINCT city, city, '' FROM (
          SELECT city FROM delivery_zones WHERE "companyId"=${companyId}
          UNION SELECT city FROM shipments WHERE "companyId"=${companyId}
        ) cities WHERE ${q.kind}='cities' AND city<>''
        UNION ALL
        SELECT id, name, address FROM warehouses
        WHERE ${q.kind}='warehouses' AND "companyId"=${companyId} AND "archivedAt" IS NULL
        UNION ALL
        SELECT s.id, s."trackingNumber", s."recipientName" || ' ' || s."recipientPhone" FROM shipments s
        WHERE ${q.kind}='parcels' AND s."companyId"=${companyId}
          AND (${collectable}='false' OR (s.status='DELIVERED'
            AND NOT EXISTS (SELECT 1 FROM cod_collections c WHERE c."shipmentId"=s.id)
            AND (s."codMinor">0 OR (s."pricingMode"='LEGACY' AND s."feePayer"='CUSTOMER'))))
      ), matches AS (
        SELECT *, strpos(lower(translate(regexp_replace(label || ' ' || detail,
          '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'), 'أإآةى', 'اااهي')), ${term})>0 AS matched
        FROM candidates
      )
      SELECT id, label, detail, matched FROM matches
      WHERE matched OR id=${selected}
      ORDER BY (id=${selected}) DESC, label, id LIMIT ${limit + 1}
    `
        .returnsRow({
          id: 'pg/text@1',
          label: 'pg/text@1',
          detail: 'pg/text@1',
          matched: 'pg/bool@1',
        })
        .build(),
    );
    const item = (r: (typeof rows)[number]) => ({
      id: r.id,
      label: r.label,
      detail: r.detail,
    });
    const selectedRow = rows.find((r) => r.id === selected);
    return {
      companyId,
      items: rows
        .filter((r) => r.matched)
        .slice(0, limit)
        .map(item),
      selected: selectedRow ? item(selectedRow) : null,
    };
  }
}
