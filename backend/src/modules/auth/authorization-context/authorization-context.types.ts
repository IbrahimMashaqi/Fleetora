import type { TokenPayload } from '../token/token.payload.js';

// Internal input from validated authentication; never bind this to request bodies.
export type ValidatedIdentity = Readonly<Pick<TokenPayload, 'sub'>>;

export type PlatformActor = Readonly<{
  kind: 'platform';
  userId: string;
  grantId: string;
}>;

export type CompanyActor = Readonly<{
  kind: 'company';
  userId: string;
  membershipId: string;
  companyId: string;
  principalType: 'STAFF' | 'MERCHANT' | 'DRIVER';
}>;

export type AuthorizationContext = PlatformActor | CompanyActor;
