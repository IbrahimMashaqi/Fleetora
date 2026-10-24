import type { INestApplication } from '@nestjs/common';
import { json, type Request, type Response, type NextFunction } from 'express';

/** Install before app.init(). Only the bounded Excel upload needs a larger body. */
export function configureMerchantImportBody(app: INestApplication) {
  const parse = json({ limit: 2100000 });
  // Keep a wrapper: Nest detects a middleware named jsonParser and would otherwise
  // omit its normal, smaller JSON parser for every other route.
  app.use(
    '/merchant/imports/preview',
    (req: Request, res: Response, next: NextFunction) => parse(req, res, next),
  );
}
