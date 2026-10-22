import { pathParam } from '../http.js';
import type { ListParams, PaginatedIterable } from '../pagination.js';
import type {
  Device,
  DeviceAntivirus,
  DeviceAppliedPolicy,
  DeviceCustomField,
  DeviceNotification,
  MoveDeviceResult,
  PublishDeviceRequest,
  PublishDeviceResult,
} from '../types/index.js';
import { BaseResource } from './base.js';

export interface DeviceListParams extends ListParams {
  /** Restrict to devices in this scope. */
  scopeId?: number;
}

/** Devices (`/devices`). */
export class DevicesResource extends BaseResource {
  async list(params?: DeviceListParams): Promise<Device[]> {
    return this.getList<Device>('/devices', params, { scopeId: params?.scopeId });
  }

  listAll(params?: DeviceListParams): PaginatedIterable<Device> {
    return this.iterate<Device>('/devices', params, { scopeId: params?.scopeId });
  }

  async get(id: string): Promise<Device> {
    return this.http.request<Device>('GET', `/devices/${pathParam(id, 'deviceId')}`);
  }

  async notifications(id: string, params?: ListParams): Promise<DeviceNotification[]> {
    return this.getList<DeviceNotification>(`/devices/${pathParam(id, 'deviceId')}/notifications`, params);
  }

  async antivirus(id: string): Promise<DeviceAntivirus> {
    return this.http.request<DeviceAntivirus>('GET', `/devices/${pathParam(id, 'deviceId')}/antivirus`);
  }

  async customFields(id: string): Promise<DeviceCustomField[]> {
    return this.http.request<DeviceCustomField[]>('GET', `/devices/${pathParam(id, 'deviceId')}/customfields`);
  }

  async appliedPolicies(id: string): Promise<DeviceAppliedPolicy[]> {
    return this.http.request<DeviceAppliedPolicy[]>('GET', `/devices/${pathParam(id, 'deviceId')}/appliedpolicies`);
  }

  /** Move a device to another group. WRITE operation. */
  async move(deviceId: string, groupId: number): Promise<MoveDeviceResult> {
    return this.http.request<MoveDeviceResult>('PUT', `/devices/${pathParam(deviceId, 'deviceId')}/move`, {
      body: { GroupId: groupId },
    });
  }

  /** Register or update a VSA X device instance. WRITE operation. */
  async publish(request: PublishDeviceRequest): Promise<PublishDeviceResult> {
    return this.http.request<PublishDeviceResult>('POST', '/devices', { body: request });
  }
}

