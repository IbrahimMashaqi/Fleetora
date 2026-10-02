import { Injectable } from '@nestjs/common';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../../prisma/generated/contract.d';
import contractJson from '../../prisma/generated/contract.json' with { type: 'json' };

@Injectable()
export class PrismaService {
  readonly db = postgres<Contract>({
    url: process.env.DATABASE_URL,
    contractJson,
  });

  get Company() {
    return this.db.orm.public.Company;
  }

  get User() {
    return this.db.orm.public.User;
  }

  get Worker() {
    return this.db.orm.public.Worker;
  }

  get Vehicle() {
    return this.db.orm.public.Vehicle;
  }

  get Warehouse() {
    return this.db.orm.public.Warehouse;
  }

  get Zone() {
    return this.db.orm.public.Zone;
  }

  get Shipment() {
    return this.db.orm.public.Shipment;
  }

  get ShipmentHistory() {
    return this.db.orm.public.ShipmentHistory;
  }

  get ProofOfDelivery() {
    return this.db.orm.public.ProofOfDelivery;
  }

  get LocationEvent() {
    return this.db.orm.public.LocationEvent;
  }

  get Notification() {
    return this.db.orm.public.Notification;
  }

  get AIExecution() {
    return this.db.orm.public.AIExecution;
  }
}
