# Fleetora — AI-Powered Delivery Management SaaS

> **Project Type:** B2B SaaS / Logistics & Fleet Operations  
> **Primary Goal:** Production-grade logistics management foundation with an integrated AI agent layer  
> **Project Context:** Software Graduation Project  
> **Status:** MVP / Active Development  
> **Primary Backend:** NestJS  
> **Primary Database:** PostgreSQL  
> **ORM:** Prisma  
> **Mobile:** Flutter  
> **AI Service:** Python  
> **Repository:** Fleetora

---

# 1. Executive Summary

Fleetora is a multi-tenant SaaS platform designed for delivery companies and logistics operators.

The system manages the operational lifecycle of shipments from creation through planning, worker assignment, dispatch, pickup, delivery, proof of delivery, failure handling, and analytics.

Fleetora is intentionally designed as more than a CRUD logistics dashboard. Its long-term differentiator is an **AI Operations Layer** capable of reading operational data, reasoning about the current situation, calling system tools, and producing or executing operational actions under controlled permissions.

The core platform should work correctly without AI. AI is an integrated operational capability built on top of reliable domain data, business rules, APIs, and event history.

---

# 2. Problem Statement

Delivery companies commonly need to coordinate:

- Customers and merchants
- Shipments
- Delivery workers
- Vehicles
- Warehouses
- Zones
- Routes and assignments
- Delivery statuses
- Proof of delivery
- Failed deliveries
- Worker workload
- Operational performance
- Exceptions and delays

Without a centralized system, operations may depend on spreadsheets, messaging applications, phone calls, manually maintained status lists, and disconnected tools.

This creates problems such as:

- Poor shipment visibility
- Manual worker assignment
- Delayed identification of risky shipments
- Uneven worker workload
- Weak historical analytics
- Difficult operational decision-making
- Lack of structured data for automation

Fleetora addresses these problems through one operational platform with an AI-assisted decision layer.

---

# 3. Vision

Fleetora should become an operational control system for delivery businesses.

The intended evolution is:

```text
Manual Operations
       ↓
Digital Logistics Management
       ↓
Operational Analytics
       ↓
AI-Assisted Decisions
       ↓
Controlled AI Automation
       ↓
Intelligent Logistics Operations
```

The platform should progressively move from:

> "Here is the data."

to:

> "Here is what is happening."

to:

> "Here is what is likely to happen."

to:

> "Here is what should be done."

and eventually:

> "I can execute the approved action for you."

---

# 4. Core Product Principles

## 4.1 AI is not the foundation

The logistics system must function without AI.

The AI layer depends on:

- Reliable database records
- Clear domain models
- Business rules
- Historical events
- Operational metrics
- Well-defined APIs/tools

## 4.2 Multi-tenancy is fundamental

Each company is an isolated tenant.

A company must only access:

- Its users
- Its workers
- Its merchants
- Its shipments
- Its warehouses
- Its zones
- Its operational data

## 4.3 Backend owns business rules

Business logic should not be duplicated across:

- Flutter
- Web frontend
- AI service

The backend is the source of truth.

## 4.4 AI should use tools

The AI agent should not directly manipulate the database.

Instead:

```text
AI Agent
   ↓
Tool
   ↓
Backend API / Service
   ↓
Business Rules
   ↓
Database
```

## 4.5 Every important operational action should be auditable

Examples:

- Shipment status change
- Worker assignment
- Route/plan change
- Delivery failure
- AI-generated recommendation
- AI-executed action

---

# 5. Target Users

## 5.1 Platform Administrator

Manages the Fleetora SaaS platform.

Responsibilities:

- Companies
- Plans
- Platform-level configuration
- Platform monitoring
- Subscription status

## 5.2 Company Administrator

Manages a logistics company.

Responsibilities:

- Users
- Workers
- Vehicles
- Warehouses
- Zones
- Shipments
- Assignments
- Analytics
- Company configuration

## 5.3 Merchant

A business/customer that creates or manages shipments.

Responsibilities may include:

- Creating shipments
- Viewing shipment status
- Tracking delivery progress
- Reviewing proof of delivery

## 5.4 Accountant

Focused on financial/operational records.

Potential responsibilities:

- Billing-related information
- Shipment financial information
- Operational reports

Exact permissions should be finalized through RBAC.

## 5.5 Delivery Worker

Uses the Flutter mobile application.

Responsibilities:

- View assigned tasks
- Navigate to deliveries
- Update delivery status
- Capture proof of delivery
- Report delivery issues
- Share location during active operations

---

# 6. Product Scope

## 6.1 Core Logistics

- Company management
- User management
- Authentication
- Role-based authorization
- Merchant management
- Shipment management
- Worker management
- Vehicle management
- Warehouse management
- Zone management
- Assignment management
- Delivery status management
- Proof of delivery
- Delivery issue reporting
- Location tracking
- Notifications
- Operational analytics

## 6.2 AI Operations

- Operational data analysis
- Shipment risk analysis
- Worker workload analysis
- Delivery delay analysis
- Operational recommendations
- Tool calling
- Controlled action execution
- Agent state/memory
- AI audit trail
- Evaluation and observability

---

# 7. Shipment Lifecycle

The canonical shipment lifecycle is:

```text
CREATED
   ↓
PLANNED
   ↓
ASSIGNED
   ↓
DISPATCHED
   ↓
PICKED_UP
   ↓
OUT_FOR_DELIVERY
   ↓
DELIVERED
```

Failure branch:

```text
OUT_FOR_DELIVERY
       ↓
FAILED
       ↓
RETRY / RESCHEDULE / RETURN
```

The exact enum values should remain centralized in the backend.

---

# 8. Operational Workflow

## 8.1 Shipment Creation

A merchant/company creates a shipment.

Required conceptual information:

- Sender
- Recipient
- Address
- Contact information
- Shipment type
- Package information
- Delivery requirements
- Priority
- Time window, if applicable

Backend validates the shipment.

---

## 8.2 Planning

The system determines:

- Which shipments need delivery
- Relevant zones
- Available workers
- Worker workload
- Vehicle constraints
- Priority
- Time constraints

The result becomes an operational plan.

---

## 8.3 Assignment

A shipment/task is assigned to a worker.

Assignment must validate:

- Worker availability
- Worker status
- Company ownership
- Relevant zone
- Existing workload
- Assignment conflicts

---

## 8.4 Dispatch

The worker begins the delivery operation.

The shipment becomes visible in the worker application.

---

## 8.5 Pickup

Worker confirms pickup.

A shipment event is recorded.

---

## 8.6 Out for Delivery

Worker starts delivery.

Relevant location updates may be recorded.

---

## 8.7 Delivery

Worker marks:

```text
DELIVERED
```

and provides proof when required.

Possible proof:

- Photo
- Recipient signature
- Recipient confirmation
- Timestamp
- GPS position

---

## 8.8 Failed Delivery

Worker reports a reason.

Examples:

- Recipient unavailable
- Wrong address
- Recipient rejected
- Vehicle problem
- Road/access issue
- Other operational issue

The company can then:

- Retry
- Reschedule
- Return
- Cancel

---

# 9. System Architecture

High-level architecture:

```text
                    ┌─────────────────────┐
                    │     Web Dashboard   │
                    │ Admin / Operations  │
                    └──────────┬──────────┘
                               │
                               │ HTTPS
                               ▼
                    ┌─────────────────────┐
                    │     NestJS API      │
                    │  Core Backend       │
                    └───────┬─────┬───────┘
                            │     │
               ┌────────────┘     └──────────────┐
               ▼                                  ▼
       ┌─────────────────┐               ┌─────────────────┐
       │   PostgreSQL    │               │ Redis           │
       │ Operational DB  │               │ Cache / Queue   │
       └─────────────────┘               └─────────────────┘
               ▲                                  ▲
               │                                  │
               │                                  │
       ┌───────┴─────────┐                        │
       │     Prisma      │                        │
       └─────────────────┘                        │
                                                  │
                    ┌─────────────────────────────┘
                    │
                    ▼
          ┌──────────────────────┐
          │   Python AI Service  │
          │ Agents / LangGraph   │
          └──────────┬───────────┘
                     │
                     ▼
               LLM Provider

                    ▲
                    │
              Tool Calls
                    │
                    ▼
              NestJS Services


                    ┌─────────────────────┐
                    │ Flutter Worker App  │
                    └──────────┬──────────┘
                               │
                               │ HTTPS / WebSocket
                               ▼
                         NestJS Backend
```

---

# 10. Recommended Repository Structure

```text
fleetora/
│
├── backend/
│   ├── src/
│   │   ├── app/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── companies/
│   │   ├── merchants/
│   │   ├── shipments/
│   │   ├── workers/
│   │   ├── vehicles/
│   │   ├── warehouses/
│   │   ├── zones/
│   │   ├── assignments/
│   │   ├── deliveries/
│   │   ├── tracking/
│   │   ├── notifications/
│   │   ├── analytics/
│   │   ├── audit/
│   │   ├── common/
│   │   └── main.ts
│   │
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   │
│   ├── test/
│   ├── Dockerfile
│   ├── package.json
│   └── README.md
│
├── ai/
│   ├── app/
│   │   ├── agents/
│   │   ├── graphs/
│   │   ├── tools/
│   │   ├── state/
│   │   ├── memory/
│   │   ├── retrieval/
│   │   ├── evaluation/
│   │   ├── observability/
│   │   └── main.py
│   │
│   ├── tests/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── README.md
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── modules/
│   │   ├── components/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── lib/
│   ├── package.json
│   └── README.md
│
├── mobile/
│   ├── lib/
│   │   ├── core/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── tasks/
│   │   │   ├── deliveries/
│   │   │   ├── tracking/
│   │   │   └── profile/
│   │   └── main.dart
│   ├── test/
│   └── pubspec.yaml
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── ai/
│   ├── deployment/
│   └── decisions/
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

# 11. Backend Architecture

NestJS should use a modular architecture.

Recommended structure for each feature:

```text
shipments/
├── controllers/
├── services/
├── dto/
├── entities/
├── repositories/
├── guards/
├── policies/
└── shipments.module.ts
```

For simpler modules, these can be grouped:

```text
shipments/
├── dto/
├── shipments.controller.ts
├── shipments.service.ts
├── shipments.repository.ts
└── shipments.module.ts
```

The exact structure should be chosen consistently rather than mixing styles randomly.

---

# 12. Backend Responsibilities

NestJS is responsible for:

- Authentication
- Authorization
- Tenant isolation
- Validation
- Domain logic
- Database access
- Shipment lifecycle
- Worker assignment
- Tracking
- Notifications
- Analytics aggregation
- Audit logging
- AI tool execution
- API contracts

---

# 13. Authentication

Recommended model:

```text
User
  ↓
Credentials
  ↓
Authentication
  ↓
Access Token + Refresh Token
```

Access token:

- Short-lived
- Used for API authorization

Refresh token:

- Longer-lived
- Used to obtain new access tokens
- Should be securely stored and revocable

Authentication should support:

- Login
- Logout
- Refresh
- Password reset
- Account status
- Role/permission resolution

---

# 14. Authorization

Use RBAC plus tenant isolation.

Conceptually:

```text
Request
  ↓
Authenticate
  ↓
Identify User
  ↓
Identify Company/Tenant
  ↓
Check Role
  ↓
Check Permission
  ↓
Check Resource Ownership
  ↓
Execute
```

Example:

A company administrator from Company A must never retrieve shipments belonging to Company B.

Tenant filtering should be enforced server-side.

---

# 15. Roles

Initial roles:

```text
PLATFORM_ADMIN
COMPANY_ADMIN
MERCHANT
ACCOUNTANT
DELIVERY_WORKER
```

The exact final role set can evolve.

Permissions should be granular enough to avoid putting all business logic directly into role checks.

Example permissions:

```text
shipment:create
shipment:read
shipment:update
shipment:assign
shipment:cancel

worker:create
worker:read
worker:update

analytics:read

ai:analyze
ai:recommend
ai:execute
```

---

# 16. Subscription Plans

Initial conceptual plans:

```text
TRIAL
BASIC
PRO
ENTERPRISE
```

Plans should eventually control:

- User limits
- Worker limits
- Shipment volume
- Storage
- Analytics
- AI usage
- Automation capabilities
- API access
- Support level

The plan system should be configurable rather than hard-coded throughout modules.

---

# 17. Core Domain Model

Main entities:

```text
Company
User
Merchant
Worker
Vehicle
Warehouse
Zone
Shipment
ShipmentEvent
Assignment
Delivery
ProofOfDelivery
LocationEvent
Notification
AuditLog
Subscription
Plan
```

Potential supporting entities:

```text
Address
DeliveryIssue
Route
RouteStop
AIConversation
AIExecution
AIRecommendation
```

These supporting entities should be introduced only when justified by the MVP.

---

# 18. Company

Conceptual fields:

```text
id
name
email
phone
address
status
planId
createdAt
updatedAt
```

A Company is the primary tenant.

Most operational entities should contain:

```text
companyId
```

or be reachable through a company-owned parent.

---

# 19. User

Conceptual fields:

```text
id
companyId
name
email
passwordHash
role
status
createdAt
updatedAt
```

Platform administrators may exist outside normal company tenancy.

---

# 20. Worker

A worker represents a delivery employee/driver.

Conceptual fields:

```text
id
companyId
userId
status
phone
vehicleId
currentLocation
createdAt
updatedAt
```

Worker statuses:

```text
ACTIVE
OFFLINE
ON_BREAK
SUSPENDED
```

The worker should not be considered available merely because the user account is active.

Operational availability should be derived from worker status and current workload.

---

# 21. Vehicle

Potential fields:

```text
id
companyId
workerId
type
plateNumber
status
capacity
createdAt
updatedAt
```

Vehicle types may include:

```text
MOTORCYCLE
CAR
VAN
TRUCK
OTHER
```

Exact types should be finalized based on the target logistics company.

---

# 22. Warehouse

A warehouse is an operational origin/storage point.

Potential fields:

```text
id
companyId
name
address
latitude
longitude
status
createdAt
updatedAt
```

Relationships:

```text
Company
  └── Warehouses
```

---

# 23. Zone

Zones divide the delivery territory.

Potential fields:

```text
id
companyId
warehouseId
name
description
boundary
status
```

A zone can be used for:

- Worker assignment
- Shipment planning
- Analytics
- Risk analysis
- Operational grouping

Geospatial implementation is a decision to finalize.

---

# 24. Shipment

Shipment is the central domain entity.

Potential fields:

```text
id
companyId
merchantId
warehouseId
zoneId

trackingNumber

senderName
senderPhone

recipientName
recipientPhone

deliveryAddress
latitude
longitude

status
priority

packageDescription
weight
dimensions

scheduledAt
deliveredAt
failedAt

createdAt
updatedAt
```

Additional financial fields may include:

```text
codAmount
deliveryFee
currency
```

if cash-on-delivery is part of the business model.

---

# 25. Shipment Status

Recommended conceptual enum:

```text
CREATED
PLANNED
ASSIGNED
DISPATCHED
PICKED_UP
OUT_FOR_DELIVERY
DELIVERED
FAILED
CANCELLED
RETURNED
```

Not every status transition should be allowed.

For example:

```text
DELIVERED → ASSIGNED
```

should normally be invalid.

The backend should enforce valid state transitions.

---

# 26. State Machine

Conceptually:

```text
CREATED
   │
   ▼
PLANNED
   │
   ▼
ASSIGNED
   │
   ▼
DISPATCHED
   │
   ▼
PICKED_UP
   │
   ▼
OUT_FOR_DELIVERY
   ├───────────────┐
   ▼               ▼
DELIVERED        FAILED
                   │
             ┌─────┴─────┐
             ▼           ▼
          RETRY        RETURNED
```

A dedicated domain service can enforce transitions.

---

# 27. Assignment

Assignment connects an operational task/shipment to a worker.

Conceptual fields:

```text
id
companyId
shipmentId
workerId
assignedBy
assignedAt
startedAt
completedAt
status
createdAt
updatedAt
```

Assignment history should not be destroyed simply because a shipment is reassigned.

This history becomes valuable for:

- Analytics
- Auditing
- AI
- Worker performance analysis

---

# 28. Shipment Events

A shipment event represents an important state/action change.

Example:

```text
ShipmentCreated
ShipmentPlanned
ShipmentAssigned
ShipmentDispatched
ShipmentPickedUp
ShipmentOutForDelivery
ShipmentDelivered
ShipmentFailed
ShipmentReturned
```

Conceptual record:

```text
id
shipmentId
type
actorId
metadata
timestamp
```

This event history is critical for AI and analytics.

---

# 29. Delivery

A Delivery represents the actual delivery operation.

Potential fields:

```text
id
shipmentId
workerId
assignmentId
startedAt
completedAt
status
failureReason
notes
```

This allows operational delivery data to be separated from the shipment's business identity.

---

# 30. Proof of Delivery

Potential proof:

```text
Photo
Signature
Recipient confirmation
GPS coordinates
Timestamp
```

Conceptual model:

```text
ProofOfDelivery
├── id
├── shipmentId
├── type
├── fileUrl
├── latitude
├── longitude
├── capturedAt
└── capturedBy
```

Files should be stored in object storage rather than directly inside PostgreSQL.

---

# 31. Location Tracking

Location tracking should distinguish between:

1. Current worker location
2. Historical location events
3. Real-time updates

Conceptually:

```text
Flutter App
    ↓
Location Update
    ↓
Backend
    ├── Current Worker Location
    └── LocationEvent History
```

A `LocationEvent` can contain:

```text
id
workerId
latitude
longitude
accuracy
speed
heading
timestamp
```

The system should avoid storing location every second unless there is a real operational requirement.

Sampling should be configurable.

---

# 32. WebSocket / Real-Time Updates

WebSockets can be used for:

- Worker location updates
- Shipment status changes
- Assignment updates
- Operational dashboard updates
- Notifications

REST remains appropriate for standard CRUD operations.

A possible model:

```text
REST
→ Commands / Queries

WebSocket
→ Real-time events
```

---

# 33. Notifications

Potential notification channels:

- Push notification
- In-app notification
- Email
- SMS/WhatsApp in future

Initial MVP can focus on:

- Push
- In-app

Examples:

```text
New task assigned
Shipment status changed
Delivery issue reported
AI operational alert
```

---

# 34. Analytics

The dashboard should expose operational metrics.

Examples:

### Shipment Metrics

- Total shipments
- Delivered shipments
- Failed shipments
- Pending shipments
- On-time delivery rate

### Worker Metrics

- Deliveries completed
- Failure rate
- Average delivery time
- Current workload
- Active hours

### Zone Metrics

- Shipment volume
- Failure rate
- Average delivery time
- Delay rate

### Operational Metrics

- Average time from creation to delivery
- Average assignment delay
- Average pickup delay
- Delivery success rate

---

# 35. AI Layer

The AI system is an operational agent layer.

It is not primarily a chatbot.

The agent should be able to:

```text
Observe
   ↓
Understand
   ↓
Reason
   ↓
Plan
   ↓
Call Tools
   ↓
Observe Result
   ↓
Continue / Respond
```

---

# 36. Example AI Question

Manager asks:

> "Analyze today's delivery situation and tell me whether any shipments are at risk of delay."

The agent should not answer from general knowledge.

It should retrieve operational data.

Possible flow:

```text
User
 ↓
AI API
 ↓
Agent
 ↓
get_today_shipments()
 ↓
get_active_workers()
 ↓
get_worker_workloads()
 ↓
get_problematic_zones()
 ↓
calculate_delivery_risk()
 ↓
LLM reasoning
 ↓
Structured response
```

---

# 37. AI Agent Architecture

Recommended conceptual architecture:

```text
                 ┌─────────────────┐
                 │ Manager Request │
                 └────────┬────────┘
                          ▼
                 ┌─────────────────┐
                 │ Agent / Graph   │
                 └────────┬────────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
       Data Tools    Analysis Tools  Action Tools
             │            │            │
             └────────────┼────────────┘
                          ▼
                   NestJS Backend
                          │
                          ▼
                     PostgreSQL
```

LangGraph can be used to model the agent workflow and state.

---

# 38. AI Tools

Tools should be explicit and typed.

Possible tools:

```text
get_today_shipments
get_shipment
get_worker
get_active_workers
get_worker_workload
get_zone_metrics
get_delivery_metrics
get_delayed_shipments
get_at_risk_shipments
get_shipment_history
get_available_workers
create_assignment
reassign_shipment
update_shipment_priority
notify_manager
```

Tools should expose only the minimum required data.

---

# 39. Read vs Write Tools

Separate read tools from write tools.

## Read tools

```text
get_today_shipments()
get_worker_workload()
get_zone_metrics()
get_at_risk_shipments()
```

These can generally be called automatically.

## Write tools

```text
assign_shipment()
reassign_shipment()
update_priority()
notify_worker()
```

These require stricter authorization.

---

# 40. AI Action Safety

The AI must not bypass business authorization.

Bad architecture:

```text
LLM
 ↓
Direct SQL
```

Correct architecture:

```text
LLM
 ↓
Tool
 ↓
Authorization
 ↓
Validation
 ↓
Domain Service
 ↓
Database
```

For sensitive actions, use approval:

```text
AI Recommendation
       ↓
Human Approval
       ↓
Tool Execution
```

Later, low-risk actions may be automated.

---

# 41. AI Recommendation Example

Input:

```text
Analyze today's deliveries.
```

Agent finds:

```text
12 delayed shipments
Worker A: 17 active deliveries
Worker B: 4 active deliveries
Zone C: unusually high failure rate
```

The agent may produce:

```text
Risk Level: HIGH

Findings:
- 12 shipments are currently at risk.
- Worker A has significantly higher workload.
- Zone C has elevated delivery failures.

Recommendations:
1. Reassign selected shipments from Worker A.
2. Prioritize Zone C shipments.
3. Review address/recipient issues in Zone C.
```

The exact recommendation must be based on actual retrieved data.

---

# 42. AI Structured Output

AI responses should be structured internally.

Example:

```json
{
  "summary": "Several shipments are at risk of delay.",
  "riskLevel": "HIGH",
  "findings": [],
  "recommendations": [],
  "suggestedActions": []
}
```

Structured output is preferable to parsing arbitrary natural language.

---

# 43. Agent State

Agent state may contain:

```text
userId
companyId
request
currentAnalysis
toolResults
recommendations
pendingApproval
executionResults
```

LangGraph can model this state.

State should not contain unnecessary sensitive information.

---

# 44. Memory

Memory should be separated into:

## Short-term state

Information needed for the current analysis.

## Long-term operational memory

Potentially useful recurring information, such as:

- Known problematic zones
- Company-specific operational rules
- Recurring delivery constraints

The AI should not blindly remember everything.

---

# 45. RAG

RAG is optional for operational data.

Structured operational information should normally come from database/API tools.

RAG becomes useful for unstructured knowledge such as:

- Company policies
- Delivery procedures
- SOP documents
- Internal manuals
- Exception handling rules
- Regulatory documentation

Recommended distinction:

```text
Structured operational facts
→ Database Tools

Unstructured company knowledge
→ RAG
```

---

# 46. AI Evaluation

The AI layer should eventually include evaluation.

Test categories:

### Retrieval correctness

Did the agent retrieve the correct shipments/workers?

### Reasoning correctness

Did the agent identify the correct operational issue?

### Tool selection

Did it call the correct tool?

### Action safety

Did it avoid unauthorized actions?

### Response quality

Is the final answer grounded in retrieved data?

Example evaluation case:

```text
Input:
Worker A has 20 deliveries.
Worker B has 4 deliveries.
3 shipments assigned to A are already late.

Expected:
Agent identifies workload imbalance
and recommends reassignment.
```

---

# 47. AI Observability

Log:

```text
requestId
companyId
userId
agentRunId
model
prompt/version
tool calls
tool results metadata
latency
token usage
final result
errors
action execution
```

Avoid logging secrets or unnecessary personal data.

---

# 48. AI Service API

Potential endpoints:

```http
POST /ai/analyze
POST /ai/chat
POST /ai/recommendations
POST /ai/actions/:id/approve
GET  /ai/runs/:id
```

The exact API should be finalized after the agent workflow is implemented.

---

# 49. Core Backend API

Potential REST structure:

```text
/auth
/users
/companies
/merchants
/workers
/vehicles
/warehouses
/zones
/shipments
/assignments
/deliveries
/tracking
/notifications
/analytics
/audit
```

Example:

```http
POST   /shipments
GET    /shipments
GET    /shipments/:id
PATCH  /shipments/:id
POST   /shipments/:id/assign
POST   /shipments/:id/dispatch
POST   /shipments/:id/deliver
POST   /shipments/:id/fail
```

---

# 50. API Design Rules

Use:

- DTO validation
- Pagination
- Filtering
- Sorting
- Consistent error responses
- Authentication guards
- Authorization guards
- Tenant scoping
- API versioning when needed

Example:

```http
GET /shipments?page=1&limit=20&status=OUT_FOR_DELIVERY
```

---

# 51. Error Handling

Errors should be consistent.

Conceptual format:

```json
{
  "statusCode": 400,
  "code": "INVALID_SHIPMENT_TRANSITION",
  "message": "Shipment cannot transition from DELIVERED to ASSIGNED",
  "timestamp": "...",
  "path": "/shipments/..."
}
```

Do not expose internal stack traces to clients.

---

# 52. Database

Primary database:

```text
PostgreSQL
```

ORM:

```text
Prisma
```

The database should prioritize:

- Referential integrity
- Appropriate indexes
- Unique constraints
- Foreign keys
- Tenant isolation
- Transactional consistency

---

# 53. Important Database Indexes

Potential indexes:

```text
Shipment(companyId)
Shipment(status)
Shipment(companyId, status)
Shipment(zoneId)
Shipment(merchantId)
Shipment(createdAt)

Worker(companyId)
Worker(status)

Assignment(workerId)
Assignment(shipmentId)
Assignment(assignedAt)

LocationEvent(workerId, timestamp)
```

Exact indexes should be driven by real query patterns.

---

# 54. Cascading Deletes

Use cascading deletes carefully.

Potentially safe cases:

```text
Company
 └── Users
```

may use cascading behavior depending on retention requirements.

Operational records such as:

- Shipment history
- Audit logs
- AI executions

may need retention rather than deletion.

Do not blindly use `CASCADE` for every relation.

---

# 55. Transactions

Use database transactions when multiple changes must succeed together.

Example:

```text
Assign Shipment
  ├── Validate worker
  ├── Create assignment
  ├── Update shipment status
  └── Create shipment event
```

These should be consistent.

---

# 56. Concurrency

The system must consider concurrent operations.

Example:

Two admins attempt to assign the same shipment.

The backend should prevent inconsistent state through:

- Transactions
- Appropriate constraints
- State validation
- Optimistic/pessimistic strategies where necessary

---

# 57. Security

Security requirements:

- Password hashing
- JWT authentication
- Refresh-token security
- RBAC
- Tenant isolation
- DTO validation
- Rate limiting
- CORS configuration
- Secure headers
- Input sanitization
- File upload validation
- Audit logging
- Secret management

Never store:

```text
plain passwords
API keys in source code
LLM secrets in frontend
database credentials in Git
```

---

# 58. File Storage

Proof-of-delivery files should use object storage.

Architecture:

```text
Flutter
 ↓
Backend
 ↓
Object Storage
 ↓
File URL / reference
 ↓
Database
```

The database stores metadata/reference, not large binary files.

Potential future provider:

- AWS S3

---

# 59. Redis

Redis can support:

- Caching
- Rate limiting
- Background jobs
- Temporary state
- Queue infrastructure
- Real-time coordination

Do not introduce Redis merely because it is popular. It should solve a concrete requirement.

---

# 60. Background Jobs

Useful background tasks:

```text
Send notification
Process uploaded proof
Calculate analytics
Detect delayed shipments
Generate reports
AI analysis
Cleanup expired data
```

A queue can decouple long-running tasks from HTTP requests.

---

# 61. Flutter Worker App

The mobile app is focused on the delivery worker.

Main screens:

```text
Login
Dashboard
Today's Tasks
Task Details
Navigation / Delivery
Update Status
Proof of Delivery
Report Issue
Location/Tracking
Notifications
Profile
```

---

# 62. Flutter Architecture

Recommended feature-based structure:

```text
lib/
├── core/
│   ├── network/
│   ├── storage/
│   ├── routing/
│   ├── theme/
│   └── errors/
│
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── tasks/
│   ├── deliveries/
│   ├── tracking/
│   ├── notifications/
│   └── profile/
│
└── main.dart
```

Bloc/Cubit can be used for state management.

---

# 63. Web Dashboard

The dashboard should be optimized for operations.

Potential pages:

```text
Dashboard
Shipments
Workers
Vehicles
Warehouses
Zones
Assignments
Tracking
Analytics
AI Operations
Notifications
Settings
```

---

# 64. Dashboard Overview

Possible widgets:

```text
Today's Shipments
Delivered
In Progress
Failed
At Risk
Active Workers
Unassigned Shipments
```

The dashboard should prioritize operational decisions over decorative charts.

---

# 65. AI Operations Dashboard

Potential interface:

```text
AI Operations
│
├── Current Situation
├── At-Risk Shipments
├── Workload Imbalance
├── Zone Problems
├── Recommendations
└── Action History
```

Example:

```text
HIGH RISK

8 shipments may miss their expected delivery window.

Reason:
- 2 workers overloaded
- Zone B has abnormal delays

Recommended:
Redistribute 5 shipments.
```

---

# 66. Real-Time Dashboard

The dashboard may receive events such as:

```text
shipment.updated
worker.location.updated
worker.status.updated
assignment.created
delivery.failed
ai.alert.created
```

WebSockets can deliver these events.

---

# 67. API / Frontend Contract

Frontend should never duplicate domain rules.

Example:

Bad:

```text
Frontend decides:
if shipment.status == "X"
then status = "Y"
```

Better:

```text
Frontend requests:
POST /shipments/:id/dispatch

Backend:
- validates transition
- updates database
- emits event
```

---

# 68. Testing Strategy

## Unit Tests

Test:

- Services
- Domain rules
- State transitions
- Permission checks
- Risk calculations

## Integration Tests

Test:

- Database operations
- Authentication
- Tenant isolation
- Shipment workflows

## E2E Tests

Test critical user journeys:

```text
Login
→ Create shipment
→ Assign worker
→ Worker receives task
→ Worker delivers
→ Proof uploaded
→ Shipment becomes delivered
```

## AI Evaluation

Separate AI evaluation from ordinary software tests.

---

# 69. Example Unit Tests

Shipment transition:

```text
CREATED → PLANNED       valid
PLANNED → ASSIGNED      valid
ASSIGNED → DISPATCHED   valid
DISPATCHED → DELIVERED  invalid
DELIVERED → ASSIGNED    invalid
```

Tenant isolation:

```text
Company A user
cannot retrieve
Company B shipment
```

Worker assignment:

```text
SUSPENDED worker
cannot receive assignment
```

---

# 70. Logging

Use structured logs.

Example fields:

```text
timestamp
level
service
requestId
userId
companyId
action
duration
error
```

Do not log:

- Passwords
- Access tokens
- Refresh tokens
- API keys
- Sensitive user information unnecessarily

---

# 71. Environment Configuration

Backend:

```env
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
REDIS_URL=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET=
AI_SERVICE_URL=
```

AI:

```env
LLM_API_KEY=
BACKEND_API_URL=
REDIS_URL=
```

Frontend/mobile should only receive public configuration.

---

# 72. Docker

Potential production services:

```text
backend
ai
frontend
postgres
redis
```

For local development:

```text
docker-compose.yml
```

Production databases should normally use managed infrastructure rather than self-hosting PostgreSQL without a strong reason.

---

# 73. Deployment

A possible architecture:

```text
Frontend
   ↓
Cloud Hosting

NestJS API
   ↓
Cloud Container / Managed Service

Python AI
   ↓
Cloud Container / Managed Service

PostgreSQL
   ↓
Managed PostgreSQL

Redis
   ↓
Managed Redis

Object Storage
   ↓
S3-compatible storage
```

AWS is a possible deployment target.

---

# 74. AWS Direction

Potential services:

```text
EC2 / ECS / App Runner
RDS PostgreSQL
ElastiCache Redis
S3
CloudWatch
IAM
ECR
```

The final choice should depend on cost, complexity, and graduation-project requirements.

The project should not over-engineer infrastructure before the core MVP works.

---

# 75. CI/CD

Recommended pipeline:

```text
Push
 ↓
Lint
 ↓
Unit Tests
 ↓
Build
 ↓
Integration Tests
 ↓
Docker Build
 ↓
Deploy
```

Separate environments:

```text
development
staging
production
```

For a graduation MVP, development + production may be sufficient initially.

---

# 76. Git Strategy

Recommended branches:

```text
main
develop
feature/*
fix/*
```

Example:

```text
feature/shipment-management
feature/worker-assignment
feature/ai-risk-analysis
```

Commits should describe the actual change.

---

# 77. Domain Events

Potential events:

```text
shipment.created
shipment.planned
shipment.assigned
shipment.dispatched
shipment.picked_up
shipment.out_for_delivery
shipment.delivered
shipment.failed

worker.status_changed
worker.location_updated

assignment.created
assignment.changed

ai.analysis_completed
ai.recommendation_created
ai.action_executed
```

Events are useful for:

- Notifications
- Analytics
- Audit
- AI
- Real-time UI

---

# 78. AI + Event Architecture

Future architecture:

```text
Operational Event
       ↓
Event Bus / Queue
       ↓
AI Detection
       ↓
Risk / Anomaly Analysis
       ↓
Recommendation
       ↓
Human Approval
       ↓
Action
```

Example:

```text
Worker workload suddenly increases
       ↓
System detects imbalance
       ↓
AI analyzes active assignments
       ↓
AI recommends reassignment
       ↓
Manager approves
       ↓
Backend executes
```

---

# 79. Delivery Risk Model

The first AI risk system does not need a complex ML model.

A rule/feature-based risk layer can provide grounded signals.

Possible factors:

```text
Expected delivery time
Current time
Shipment priority
Worker workload
Worker average delivery time
Zone historical delay rate
Distance
Failed delivery history
Time window
```

Conceptual:

```text
Risk =
    lateness_signal
  + workload_signal
  + zone_signal
  + historical_signal
  + priority_signal
```

Weights should be validated rather than arbitrarily presented as scientifically accurate.

---

# 80. Why Use AI Agents?

A traditional dashboard answers:

> "What is the current status?"

A conventional analytics system answers:

> "What happened?"

An AI agent can combine multiple tools and answer:

> "What is happening, why is it happening, and what should we investigate or do next?"

Agentic behavior becomes useful when the task requires:

- Multiple data sources
- Multi-step reasoning
- Dynamic tool selection
- Conditional workflows
- Operational recommendations

---

# 81. Why Not Let the LLM Query PostgreSQL Directly?

Direct SQL generation creates risks:

- Security
- Tenant isolation
- Uncontrolled access
- Incorrect queries
- Expensive queries
- Difficult authorization
- Hard-to-audit actions

Instead:

```text
LLM
 ↓
Typed Tool
 ↓
Authorized Backend Service
 ↓
Database
```

The backend remains the policy enforcement point.

---

# 82. AI Permissions

Potential AI permission levels:

```text
AI_READ_ONLY
AI_RECOMMEND
AI_EXECUTE_APPROVED
AI_AUTONOMOUS
```

The MVP should generally focus on:

```text
Read → Analyze → Recommend → Human Approval → Execute
```

This provides a safer demonstration of agentic AI without making the system uncontrollably autonomous.

---

# 83. Audit System

Audit logs should record important actions.

Conceptual:

```text
AuditLog
├── id
├── companyId
├── actorType
├── actorId
├── action
├── entityType
├── entityId
├── metadata
└── createdAt
```

Actor types may include:

```text
USER
SYSTEM
AI
```

---

# 84. Observability

Track:

### Backend

- Request latency
- Error rate
- Database latency
- Queue latency

### AI

- Agent latency
- Tool calls
- Model usage
- Token consumption
- Tool errors
- Execution failures

### Business

- Delivery completion
- Failure rate
- Delays
- Worker utilization

---

# 85. MVP Definition

The graduation MVP should prioritize a complete operational loop.

## Must Have

```text
Authentication
RBAC
Company/Tenant
Workers
Merchants
Shipments
Shipment lifecycle
Assignment
Flutter worker app
Proof of delivery
Basic tracking
Dashboard
Basic analytics
AI risk analysis
AI tool calling
Audit trail
```

## Should Have

```text
Real-time updates
Notifications
Zone management
Vehicle management
AI recommendations
Human approval
Redis/background jobs
```

## Later

```text
Advanced routing
Autonomous execution
Complex RAG
Predictive ML
Dynamic pricing
Advanced billing
External logistics integrations
Multi-provider messaging
```

---

# 86. Graduation Project Timeline

A practical sequence:

## Phase 1 — Foundation

```text
Repository
Architecture
Database
Authentication
Tenant model
RBAC
```

## Phase 2 — Logistics Core

```text
Workers
Merchants
Shipments
Warehouses
Zones
Assignments
Status lifecycle
```

## Phase 3 — Worker Application

```text
Flutter authentication
Tasks
Task details
Status updates
Proof
Issues
Location
```

## Phase 4 — Dashboard

```text
Shipment management
Worker management
Assignments
Tracking
Analytics
```

## Phase 5 — AI

```text
Python service
LLM API
Tool calling
Operational analysis
Risk detection
Recommendations
LangGraph
```

## Phase 6 — Production Hardening

```text
Testing
Security
Audit
Observability
Docker
Deployment
Documentation
```

---

# 87. Suggested AI Development Sequence

Do not start with multi-agent systems.

Recommended sequence:

```text
Python
 ↓
LLM API
 ↓
Structured Output
 ↓
Tool Calling
 ↓
RAG fundamentals
 ↓
State / Memory
 ↓
Single Agent
 ↓
LangGraph
 ↓
Multi-step Agent
 ↓
Evaluation
 ↓
Observability
 ↓
Production
```

The first useful Fleetora AI milestone is a **single operational agent with tools**.

---

# 88. Example First Agent

Name:

```text
Operations Analyst Agent
```

Input:

```text
"Analyze today's deliveries."
```

Tools:

```text
get_today_shipments
get_active_workers
get_worker_workloads
get_zone_metrics
get_at_risk_shipments
```

Output:

```text
Situation Summary
Risk Level
Key Findings
Recommended Actions
Evidence
```

This is enough to demonstrate meaningful agentic behavior.

---

# 89. Example Second Agent

Potential future agent:

```text
Dispatch Optimization Agent
```

Responsibilities:

- Analyze unassigned shipments
- Analyze available workers
- Consider workload
- Consider zones
- Recommend assignments

Later it can execute approved assignments.

---

# 90. Potential Multi-Agent Architecture

Only after the single-agent system works:

```text
                    Operations Supervisor
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        Risk Agent     Dispatch Agent   Analytics Agent
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                      Tool Layer
                            ▼
                       NestJS API
```

Multi-agent architecture should solve a real complexity problem, not exist merely to demonstrate multiple agents.

---

# 91. Non-Functional Requirements

## Performance

Common API requests should normally respond quickly enough for interactive use.

Heavy tasks should move to background jobs.

## Scalability

The system should support adding companies without rewriting the architecture.

## Reliability

Critical state changes must be transactional.

## Security

Tenant isolation and authorization are mandatory.

## Maintainability

Modules should have clear boundaries.

## Observability

Important backend and AI operations must be traceable.

---

# 92. Important Architectural Decisions

## Decision: NestJS Backend

Reason:

- Strong modular architecture
- TypeScript
- Dependency injection
- Guards
- Validation
- Good fit for REST APIs
- Suitable for WebSockets
- Familiarity with Node ecosystem

## Decision: PostgreSQL

Reason:

- Relational logistics domain
- Strong consistency
- Transactions
- Complex queries
- Mature ecosystem

## Decision: Prisma

Reason:

- Type-safe database access
- Migration system
- Good TypeScript integration

## Decision: Flutter

Reason:

- Single mobile codebase
- Suitable for worker application
- Existing project experience

## Decision: Python for AI

Reason:

- Strong AI/LLM ecosystem
- LangGraph/LangChain ecosystem
- Easy experimentation
- Clear separation between core backend and AI reasoning

---

# 93. Architecture Boundary

A critical boundary:

```text
NestJS
= System of Record + Business Rules

Python
= AI Reasoning + Agent Orchestration

PostgreSQL
= Operational Data

Flutter
= Worker Interface

Frontend
= Management Interface
```

This boundary prevents the AI service from becoming a second uncontrolled backend.

---

# 94. Data Flow — Normal Operation

```text
Worker
 ↓
Flutter
 ↓
REST API
 ↓
NestJS
 ↓
Validation
 ↓
Authorization
 ↓
Domain Service
 ↓
Prisma
 ↓
PostgreSQL
 ↓
Event
 ↓
Notification / WebSocket / Analytics
```

---

# 95. Data Flow — AI Analysis

```text
Manager
 ↓
Dashboard
 ↓
AI API
 ↓
Python Agent
 ↓
Tool Call
 ↓
NestJS
 ↓
Authorization
 ↓
Database
 ↓
Tool Result
 ↓
Agent Reasoning
 ↓
Structured Recommendation
 ↓
Dashboard
```

---

# 96. Data Flow — AI Action

```text
Manager
 ↓
AI Recommendation
 ↓
Approve
 ↓
AI Action Tool
 ↓
NestJS
 ↓
Permission Check
 ↓
Business Validation
 ↓
Transaction
 ↓
Database
 ↓
Audit Log
 ↓
Event
 ↓
Result
```

---

# 97. Example End-to-End Scenario

Company receives 100 shipments.

```text
1. Merchant creates shipments.
2. Backend validates them.
3. Shipments enter CREATED.
4. Operations manager plans deliveries.
5. Workers become assigned.
6. Workers receive tasks in Flutter.
7. Workers dispatch.
8. Workers update pickup/delivery states.
9. Location updates are received.
10. Proof of delivery is uploaded.
11. Shipment becomes DELIVERED.
12. Analytics update.
13. AI analyzes operational data.
14. AI identifies delay risks.
15. Manager receives recommendations.
16. Manager approves an action.
17. Backend executes it.
18. Audit log records the action.
```

This represents the core Fleetora story.

---

# 98. Demo Scenario for Graduation Defense

Recommended demonstration:

### Step 1

Create several shipments.

### Step 2

Assign them to different workers.

### Step 3

Show worker tasks in Flutter.

### Step 4

Simulate deliveries and failures.

### Step 5

Show dashboard metrics.

### Step 6

Ask AI:

> "Analyze today's delivery situation and identify shipments at risk of delay."

### Step 7

AI calls operational tools.

### Step 8

AI identifies:

- overloaded worker
- delayed shipments
- problematic zone

### Step 9

AI recommends an action.

### Step 10

Manager approves.

### Step 11

Backend executes the action.

### Step 12

Dashboard updates and audit log shows the action.

This demonstrates:

```text
Software Engineering
+
Distributed Systems
+
Mobile
+
Backend
+
Database
+
Real-Time Systems
+
AI Agents
```

---

# 99. What Makes Fleetora Technically Interesting

The project combines multiple engineering areas:

```text
Multi-Tenant SaaS
        +
REST APIs
        +
Authentication / RBAC
        +
Relational Database
        +
Mobile Application
        +
Real-Time Tracking
        +
Event History
        +
Analytics
        +
LLM Tool Calling
        +
Agent Orchestration
        +
Human-in-the-Loop Automation
```

The strongest architectural point is that AI is grounded in the actual operational system.

---

# 100. Risks

## Risk: AI becomes a chatbot

Mitigation:

- Tools
- Structured outputs
- Operational data
- Actions
- Audit

## Risk: Over-engineering

Mitigation:

Build the logistics core first.

## Risk: AI hallucination

Mitigation:

- Tool-based data retrieval
- Structured output
- Evidence
- Evaluation
- No direct database access

## Risk: Tenant data leakage

Mitigation:

- Server-side company scoping
- Authorization
- Tests
- Database constraints
- Audit

## Risk: Real-time complexity

Mitigation:

Start with REST and add WebSockets where they solve a concrete requirement.

## Risk: Too many features

Mitigation:

Define a strict MVP.

---

# 101. MVP Success Criteria

Fleetora MVP is successful when:

1. A company can log in.
2. Company users are isolated from other companies.
3. A merchant can create shipments.
4. Admin can manage workers.
5. Admin can assign shipments.
6. Worker can receive tasks.
7. Worker can update delivery status.
8. Worker can submit proof.
9. Manager can see operational status.
10. Basic analytics are available.
11. AI can analyze real operational data.
12. AI can call backend tools.
13. AI can produce grounded recommendations.
14. Sensitive actions require authorization/approval.
15. Important actions are auditable.
16. The system can be deployed reproducibly.

---

# 102. Future Roadmap

After MVP:

```text
Advanced Route Optimization
        ↓
Predictive ETA
        ↓
Demand Forecasting
        ↓
Anomaly Detection
        ↓
Automated Dispatch
        ↓
External Maps Integration
        ↓
Customer Tracking Portal
        ↓
Merchant API
        ↓
Billing / Subscriptions
        ↓
Advanced AI Automation
```

Potential ML systems can eventually complement the LLM agent.

---

# 103. LLM vs Traditional Algorithms

Fleetora should not use an LLM for everything.

Use deterministic algorithms for:

- Distance
- Time calculations
- Status validation
- Permissions
- Billing calculations
- SLA calculations
- Route constraints
- Numerical metrics

Use AI/LLMs for:

- Natural-language analysis
- Multi-source operational reasoning
- Explanation
- Recommendations
- Tool orchestration
- Unstructured document understanding

Correct principle:

```text
Deterministic computation → Code

Reasoning over operational context → AI
```

---

# 104. Recommended Technology Stack

## Backend

```text
Node.js
TypeScript
NestJS
Prisma
PostgreSQL
JWT
WebSockets
Jest
```

## AI

```text
Python
FastAPI
LLM API
LangGraph
Optional LangChain components
Redis
Evaluation / tracing tooling
```

## Frontend

```text
React / Next.js
TypeScript
```

## Mobile

```text
Flutter
Dart
Bloc/Cubit
```

## Infrastructure

```text
Docker
PostgreSQL
Redis
Object Storage
AWS or equivalent cloud
CI/CD
```

---

# 105. Technology Decisions Still To Finalize

These should be treated as open architectural decisions rather than assumed facts:

- Final frontend framework/version
- Exact map provider
- Exact object storage provider
- Exact LLM provider
- Exact Redis usage
- Queue technology
- WebSocket gateway details
- Geospatial database strategy
- Subscription/payment provider
- Notification provider
- Production cloud architecture
- Final Prisma version
- Exact shipment state machine
- Exact RBAC permission matrix

---

# 106. Suggested First Implementation Order

If rebuilding from a clean repository:

```text
1. Monorepo/repository setup
2. PostgreSQL
3. Prisma schema
4. Company/Tenant
5. User/Auth
6. RBAC
7. Worker
8. Merchant
9. Shipment
10. Shipment lifecycle
11. Assignment
12. Flutter authentication
13. Flutter tasks
14. Delivery workflow
15. Proof of delivery
16. Location tracking
17. Dashboard
18. Analytics
19. Python AI service
20. AI tool layer
21. First operational agent
22. Risk analysis
23. Recommendations
24. Approval/action execution
25. Audit
26. Testing
27. Docker
28. Deployment
29. Documentation
```

---

# 107. Definition of Done for Core Shipment Module

A shipment module is not complete merely because CRUD works.

It should include:

```text
[ ] Create shipment
[ ] Read shipment
[ ] Update shipment
[ ] Cancel shipment
[ ] Validate tenant
[ ] Validate permissions
[ ] Validate state transitions
[ ] Assignment
[ ] Event history
[ ] Audit
[ ] Pagination
[ ] Filtering
[ ] Tests
[ ] Error handling
```

---

# 108. Definition of Done for AI Module

```text
[ ] Python service exists
[ ] Backend-to-AI communication works
[ ] LLM provider integrated
[ ] Structured output implemented
[ ] Tool calling implemented
[ ] Tools retrieve real Fleetora data
[ ] Agent state implemented
[ ] Tenant context enforced
[ ] AI cannot bypass backend authorization
[ ] Risk analysis works
[ ] Recommendation output works
[ ] AI run logging exists
[ ] Evaluation cases exist
```

---

# 109. Final Architecture

The target architecture can be summarized as:

```text
                         FLEETORA
              AI-Powered Delivery Platform
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   Web Dashboard        Flutter Worker App       AI Layer
        │                     │                     │
        └──────────────┬──────┴──────────────┬─────┘
                       ▼                     │
                 NestJS Backend             │
                       │                     │
          ┌────────────┼────────────┐       │
          ▼            ▼            ▼       │
      PostgreSQL     Redis      Object      │
                               Storage       │
          │                                   │
          └──────────────┬────────────────────┘
                         ▼
                  Operational Data
                         │
                         ▼
                    AI Tools
                         │
                         ▼
                  Agent / LangGraph
                         │
                         ▼
                    LLM Reasoning
                         │
                  ┌──────┴──────┐
                  ▼             ▼
             Recommendation   Action
                  │             │
                  ▼             ▼
              Manager       Approval
                                │
                                ▼
                         Backend Execution
                                │
                                ▼
                           Audit/Event
```

---

# 110. One-Sentence Project Definition

> **Fleetora is a multi-tenant AI-powered logistics SaaS platform that manages the complete delivery lifecycle and uses operational AI agents to analyze real-time business data, identify risks, recommend actions, and execute approved operational decisions through controlled backend tools.**

---

# 111. Project Positioning

Fleetora should be presented as:

> **An intelligent logistics operations platform, not an AI chatbot.**

The engineering story is:

```text
Reliable Logistics Core
        +
Operational Data
        +
Real-Time Events
        +
Analytics
        +
AI Agents
        +
Controlled Automation
```

That separation is important both technically and academically.

---

# 112. Documentation Status

This document is the **master architectural/product specification**.

Before implementation, the following should be converted into concrete artifacts:

```text
docs/
├── requirements.md
├── architecture.md
├── database.md
├── api.md
├── authentication.md
├── authorization.md
├── shipment-lifecycle.md
├── tracking.md
├── ai-architecture.md
├── ai-tools.md
├── ai-evaluation.md
├── deployment.md
├── security.md
└── decisions/
```

The master document should remain high-level enough to evolve while those documents contain implementation-level details.

---

# 113. Important Implementation Principle

Do not implement everything described here at once.

The correct development strategy is:

```text
Build the Core
      ↓
Make the Core Correct
      ↓
Expose Clean APIs
      ↓
Add Mobile/Web Clients
      ↓
Collect Operational Events
      ↓
Add Analytics
      ↓
Add AI Tools
      ↓
Add Agent Reasoning
      ↓
Add Controlled Automation
```

This keeps Fleetora a real software system first and an AI system second—while allowing the AI layer to become a genuine operational differentiator.
