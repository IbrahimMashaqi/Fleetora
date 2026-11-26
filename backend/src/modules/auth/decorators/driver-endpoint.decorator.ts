import { SetMetadata } from '@nestjs/common';
export const DRIVER_ENDPOINT = 'fleetora.driver-endpoint';
export const DriverEndpoint = () => SetMetadata(DRIVER_ENDPOINT, true);
