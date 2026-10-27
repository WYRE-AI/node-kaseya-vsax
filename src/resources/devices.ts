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

/** List parameters for devices. */
export interface DeviceListParams extends ListParams {
  /** Restrict to devices in this scope. */
  scopeId?: number;
}

/** Devices (`/devices`). */
export class DevicesResource extends BaseResource {
  /** List devices (single page). */
  async list(params?: DeviceListParams): Promise<Device[]> {
    return this.getList<Device>('/devices', params, { scopeId: params?.scopeId });
  }

  /** Iterate over all devices across pages. */
  listAll(params?: DeviceListParams): PaginatedIterable<Device> {
    return this.iterate<Device>('/devices', params, { scopeId: params?.scopeId });
  }

  /** Get a device. */
  async get(id: string): Promise<Device> {
    return this.http.request<Device>('GET', `/devices/${pathParam(id, 'deviceId')}`);
  }

  /** List notifications for the device. */
  async notifications(id: string, params?: ListParams): Promise<DeviceNotification[]> {
    return this.getList<DeviceNotification>(`/devices/${pathParam(id, 'deviceId')}/notifications`, params);
  }

  /** Get antivirus status for the device. */
  async antivirus(id: string): Promise<DeviceAntivirus> {
    return this.http.request<DeviceAntivirus>('GET', `/devices/${pathParam(id, 'deviceId')}/antivirus`);
  }

  /** Get custom fields assigned to the entity. */
  async customFields(id: string): Promise<DeviceCustomField[]> {
    return this.http.request<DeviceCustomField[]>('GET', `/devices/${pathParam(id, 'deviceId')}/customfields`);
  }

  /** List policies applied to the device. */
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

