---
name: backend-security
description: Security rules for Fleetora backend. Use when working on authentication, JWT, refresh tokens, authorization, RBAC, tenant isolation, user/company access, password flows, sensitive data, security-sensitive endpoints, or reviewing backend security.
---

# Fleetora Backend Security

## Purpose

This skill defines the security rules for Fleetora's NestJS backend.

Fleetora is a multi-tenant logistics SaaS.

Security must be enforced by the backend and must never depend on frontend behavior.

This skill covers:

- Authentication
- JWT
- Refresh tokens
- Authorization
- RBAC
- Tenant isolation
- User/company context
- Password security
- Sensitive data
- Platform administration
- Security-sensitive API design

It complements:

- root AGENTS.md
- backend/AGENTS.md
- backend-engineering skill
- database-prisma skill
- Fleetora project documentation

---

# 1. Core Security Principle

Never trust the client to enforce security.

The client may provide identifiers and requested actions.

The backend determines:

- who the actor is
- which tenant they belong to
- what permissions they have
- whether the resource belongs to that tenant
- whether the requested action is allowed

Frontend hiding is not authorization.

---

# 2. Inspect Before Modifying Security Code

Before changing authentication or authorization:

1. inspect existing auth module
2. inspect guards
3. inspect strategies
4. inspect token service
5. inspect token payload
6. inspect User and Company models
7. inspect affected domain module
8. inspect existing tests
9. inspect relevant Fleetora documentation

Do not replace existing security architecture without understanding it.

---

# 3. Authentication and Authorization Are Different

Authentication answers:

> Who is making the request?

Authorization answers:

> Is this actor allowed to perform this operation?

Tenant isolation answers:

> Is this actor allowed to access this company's resource?

All three must be considered separately.

A valid JWT does not automatically authorize an operation.

---

# 4. Trusted User Context

After successful authentication, create a trusted server-side representation of the actor.

Conceptually:

```ts
type AuthenticatedUser = {
  userId: string;
  role: UserRole;
  companyId: string | null;
};
```
