import { describe, expect, it } from 'vitest';
import { BASE, call, makeClient, newFetch, ok, type FetchMock } from '../helpers.js';
import type { KaseyaVsaxClient } from '../../src/index.js';

interface Case {
  name: string;
  run: (c: KaseyaVsaxClient) => Promise<unknown>;
  method: string;
  path: string;
  body?: unknown;
}

const cases: Case[] = [
  { name: 'devices.list', run: (c) => c.devices.list({ top: 10, skip: 5, filter: 'IsAgentInstalled eq true', orderby: 'Name', count: true, scopeId: 7 }), method: 'GET',
    path: `/devices?scopeId=7&$top=10&$skip=5&$filter=${encodeURIComponent('IsAgentInstalled eq true')}&$orderby=Name&$count=true` },
  { name: 'devices.get', run: (c) => c.devices.get('guid-1'), method: 'GET', path: '/devices/guid-1' },
  { name: 'devices.notifications', run: (c) => c.devices.notifications('guid-1', { top: 5 }), method: 'GET', path: '/devices/guid-1/notifications?$top=5' },
  { name: 'devices.antivirus', run: (c) => c.devices.antivirus('guid-1'), method: 'GET', path: '/devices/guid-1/antivirus' },
  { name: 'devices.customFields', run: (c) => c.devices.customFields('guid-1'), method: 'GET', path: '/devices/guid-1/customfields' },
  { name: 'devices.appliedPolicies', run: (c) => c.devices.appliedPolicies('guid-1'), method: 'GET', path: '/devices/guid-1/appliedpolicies' },
  { name: 'devices.move', run: (c) => c.devices.move('guid-1', 42), method: 'PUT', path: '/devices/guid-1/move', body: { GroupId: 42 } },
  { name: 'devices.publish', run: (c) => c.devices.publish({ InstanceId: 'i', GroupId: 1 }), method: 'POST', path: '/devices', body: { InstanceId: 'i', GroupId: 1 } },
  { name: 'assets.list', run: (c) => c.assets.list({ top: 50, include: ['Security', 'Disks'] }), method: 'GET', path: '/assets?include=Security%2CDisks&$top=50' },
  { name: 'assets.get', run: (c) => c.assets.get('guid-1', ['None']), method: 'GET', path: '/assets/guid-1?include=None' },
  { name: 'scripts.list', run: (c) => c.automation.scripts.list(), method: 'GET', path: '/automation/scripts' },
  { name: 'scripts.get', run: (c) => c.automation.scripts.get('s-1'), method: 'GET', path: '/automation/scripts/s-1' },
  { name: 'scripts.run', run: (c) => c.automation.scripts.run('s-1', { DeviceIdentifier: 'd-1' }), method: 'POST', path: '/automation/scripts/s-1/run', body: { DeviceIdentifier: 'd-1' } },
  { name: 'scripts.executions.list', run: (c) => c.automation.scripts.executions.list('s-1', 'd-1'), method: 'GET', path: '/automation/scripts/s-1/device/d-1/executions' },
  { name: 'scripts.executions.get', run: (c) => c.automation.scripts.executions.get('s-1', 'd-1', 9), method: 'GET', path: '/automation/scripts/s-1/device/d-1/executions/9' },
  { name: 'tasks.list', run: (c) => c.automation.tasks.list(), method: 'GET', path: '/automation/tasks' },
  { name: 'tasks.get', run: (c) => c.automation.tasks.get(3), method: 'GET', path: '/automation/tasks/3' },
  { name: 'tasks.run', run: (c) => c.automation.tasks.run(3, { DeviceIdentifiers: ['d-1'] }), method: 'POST', path: '/automation/tasks/3/run', body: { DeviceIdentifiers: ['d-1'] } },
  { name: 'tasks.getExecution', run: (c) => c.automation.tasks.getExecution(8), method: 'GET', path: '/automation/tasks/executions/8' },
  { name: 'tasks.executionDevices', run: (c) => c.automation.tasks.executionDevices(8), method: 'GET', path: '/automation/tasks/executions/8/devices' },
  { name: 'tasks.executionDeviceScripts', run: (c) => c.automation.tasks.executionDeviceScripts(8, 'd-1'), method: 'GET', path: '/automation/tasks/executions/8/devices/d-1/scripts' },
  { name: 'tasks.scriptOutput', run: (c) => c.automation.tasks.scriptOutput(8, 'd-1', 's-1'), method: 'GET', path: '/automation/tasks/executions/8/devices/d-1/scripts/s-1' },
  { name: 'workflows.list', run: (c) => c.automation.workflows.list(), method: 'GET', path: '/automation/workflows' },
  { name: 'workflows.get', run: (c) => c.automation.workflows.get(4), method: 'GET', path: '/automation/workflows/4' },
  { name: 'workflows.run', run: (c) => c.automation.workflows.run(4, { ConstantVariableOverrides: [{ Name: 'a', Value: 'b' }] }), method: 'POST', path: '/automation/workflows/4/run', body: { ConstantVariableOverrides: [{ Name: 'a', Value: 'b' }] } },
  { name: 'workflows.executions.list', run: (c) => c.automation.workflows.executions.list({ top: 1 }), method: 'GET', path: '/automation/workflows/executions?$top=1' },
  { name: 'workflows.executions.get', run: (c) => c.automation.workflows.executions.get(5), method: 'GET', path: '/automation/workflows/executions/5' },
  { name: 'workflows.cancelExecutions', run: (c) => c.automation.workflows.cancelExecutions([1, 2]), method: 'POST', path: '/automation/workflows/executions/cancel', body: { ExecutionIds: [1, 2] } },
  { name: 'notifications.list', run: (c) => c.notifications.list(), method: 'GET', path: '/notifications' },
  { name: 'notifications.get', run: (c) => c.notifications.get(1), method: 'GET', path: '/notifications/1' },
  { name: 'notifications.notify', run: (c) => c.notifications.notify({ InstanceId: 'i', Title: 't', Priority: 'High' as never }), method: 'POST', path: '/notifications', body: { InstanceId: 'i', Title: 't', Priority: 'High' } },
  { name: 'notifications.delete', run: (c) => c.notifications.delete(1), method: 'DELETE', path: '/notifications/1' },
  { name: 'webhooks.list', run: (c) => c.notifications.webhooks.list(), method: 'GET', path: '/notifications/webhooks' },
  { name: 'webhooks.get', run: (c) => c.notifications.webhooks.get(2), method: 'GET', path: '/notifications/webhooks/2' },
  { name: 'webhooks.create', run: (c) => c.notifications.webhooks.create({ Name: 'w', Priorities: ['Low'] }), method: 'POST', path: '/notifications/webhooks', body: { Name: 'w', Priorities: ['Low'] } },
  { name: 'webhooks.update', run: (c) => c.notifications.webhooks.update(2, { Name: 'w', Priorities: ['Low'] }), method: 'PUT', path: '/notifications/webhooks/2', body: { Name: 'w', Priorities: ['Low'] } },
  { name: 'webhooks.delete', run: (c) => c.notifications.webhooks.delete(2), method: 'DELETE', path: '/notifications/webhooks/2' },
  { name: 'webhooks.regenerateSecret', run: (c) => c.notifications.webhooks.regenerateSecret(2), method: 'POST', path: '/notifications/webhooks/2/regeneratesecretkey' },
  { name: 'organizations.list', run: (c) => c.organizations.list(), method: 'GET', path: '/organizations' },
  { name: 'organizations.get', run: (c) => c.organizations.get(1), method: 'GET', path: '/organizations/1' },
  { name: 'organizations.customFields', run: (c) => c.organizations.customFields(1), method: 'GET', path: '/organizations/1/customfields' },
  { name: 'organizations.create', run: (c) => c.organizations.create({ Name: 'o' }), method: 'POST', path: '/organizations', body: { Name: 'o' } },
  { name: 'organizations.update', run: (c) => c.organizations.update(1, { Name: 'o2' }), method: 'PUT', path: '/organizations/1', body: { Name: 'o2' } },
  { name: 'organizations.delete', run: (c) => c.organizations.delete(1), method: 'DELETE', path: '/organizations/1' },
  { name: 'sites.get', run: (c) => c.sites.get(2), method: 'GET', path: '/sites/2' },
  { name: 'sites.customFields', run: (c) => c.sites.customFields(2), method: 'GET', path: '/sites/2/customfields' },
  { name: 'sites.create', run: (c) => c.sites.create({ Name: 's', ParentId: 1 }), method: 'POST', path: '/sites', body: { Name: 's', ParentId: 1 } },
  { name: 'sites.update', run: (c) => c.sites.update(2, { Name: 's2' }), method: 'PUT', path: '/sites/2', body: { Name: 's2' } },
  { name: 'sites.delete', run: (c) => c.sites.delete(2), method: 'DELETE', path: '/sites/2' },
  { name: 'groups.get', run: (c) => c.groups.get(3), method: 'GET', path: '/groups/3' },
  { name: 'groups.customFields', run: (c) => c.groups.customFields(3), method: 'GET', path: '/groups/3/customfields' },
  { name: 'groups.getPackage', run: (c) => c.groups.getPackage(3, 'windows_agent_x64'), method: 'GET', path: '/groups/3/package/windows_agent_x64' },
  { name: 'groups.create', run: (c) => c.groups.create({ Name: 'g', ParentId: 2 }), method: 'POST', path: '/groups', body: { Name: 'g', ParentId: 2 } },
  { name: 'groups.update', run: (c) => c.groups.update(3, { Name: 'g2', Notes: 'n' }), method: 'PUT', path: '/groups/3', body: { Name: 'g2', Notes: 'n' } },
  { name: 'groups.delete', run: (c) => c.groups.delete(3), method: 'DELETE', path: '/groups/3' },
  { name: 'customFields.list', run: (c) => c.customFields.list(), method: 'GET', path: '/customFields' },
  { name: 'customFields.get', run: (c) => c.customFields.get(5), method: 'GET', path: '/customfields/5' },
  { name: 'customFields.usage', run: (c) => c.customFields.usage(5), method: 'GET', path: '/customfields/5/usage' },
  { name: 'customFields.assign', run: (c) => c.customFields.assign(5, { ContextType: 'Device', ContextItemId: 'd', Value: 'v' }), method: 'POST', path: '/customfields/5/assign', body: { ContextType: 'Device', ContextItemId: 'd', Value: 'v' } },
  { name: 'customFields.updateAssigned', run: (c) => c.customFields.updateAssigned(5, { ContextType: 'Site', ContextItemId: '1', UseDefaultValue: true }), method: 'PUT', path: '/customfields/5/updateAssigned', body: { ContextType: 'Site', ContextItemId: '1', UseDefaultValue: true } },
  { name: 'customFields.unassign', run: (c) => c.customFields.unassign(5, { ContextType: 'Group', ContextItemId: '3' }), method: 'POST', path: '/customfields/5/unassign', body: { ContextType: 'Group', ContextItemId: '3' } },
  { name: 'scopes.list', run: (c) => c.scopes.list(), method: 'GET', path: '/scopes' },
  { name: 'scopes.get', run: (c) => c.scopes.get(6), method: 'GET', path: '/scopes/6' },
  { name: 'scopes.usage', run: (c) => c.scopes.usage(6), method: 'GET', path: '/scopes/6/usage' },
  { name: 'patchManagement.getPolicy', run: (c) => c.patchManagement.getPolicy(7), method: 'GET', path: '/patchmanagement/policies/7' },
  { name: 'patchManagement.getGlobalRules', run: (c) => c.patchManagement.getGlobalRules(), method: 'GET', path: '/patchmanagement/globalrules/' },
  { name: 'endpointProtection.getPolicy', run: (c) => c.endpointProtection.getPolicy(8), method: 'GET', path: '/endpointprotection/policies/8' },
  { name: 'environment.get', run: (c) => c.environment.get(), method: 'GET', path: '/environment/' },
  { name: 'auditLogs.list', run: (c) => c.auditLogs.list({ orderby: 'AuditLogRecordId desc', top: 2 }), method: 'GET', path: `/auditlogs?$top=2&$orderby=${encodeURIComponent('AuditLogRecordId desc')}` },
  { name: 'rateLimits.get', run: (c) => c.rateLimits.get(), method: 'GET', path: '/ratelimits/' },
];

describe('resource methods hit the right method, path, query and body', () => {
  it.each(cases)('$name', async ({ run, method, path, body }) => {
    const f: FetchMock = newFetch().mockResolvedValue(ok([]));
    const { client } = makeClient(f);
    await run(client);
    expect(f).toHaveBeenCalledTimes(1);
    const { url, init } = call(f);
    expect(url).toBe(`${BASE}${path}`);
    expect(init.method).toBe(method);
    expect(init.body).toBe(body === undefined ? undefined : JSON.stringify(body));
  });

  it('listAll exists on list resources and iterates', async () => {
    const f = newFetch().mockImplementation(() => Promise.resolve(ok([])));
    const { client } = makeClient(f);
    const iterables = [
      client.assets.listAll(), client.automation.scripts.listAll(), client.automation.tasks.listAll(),
      client.automation.workflows.listAll(), client.automation.workflows.executions.listAll(),
      client.notifications.listAll(), client.notifications.webhooks.listAll(), client.organizations.listAll(),
      client.sites.listAll(), client.groups.listAll(), client.customFields.listAll(), client.scopes.listAll(),
      client.auditLogs.listAll(),
    ];
    for (const it of iterables) expect(await it.toArray()).toEqual([]);
    expect(f).toHaveBeenCalledTimes(iterables.length);
  });

  it('write helpers reject unsafe ids before any request', async () => {
    const f = newFetch();
    const { client } = makeClient(f);
    await expect(client.devices.move('../x', 1)).rejects.toThrow(/Invalid path parameter/);
    await expect(client.groups.delete('1/2')).rejects.toThrow(/Invalid path parameter/);
    await expect(client.groups.getPackage(1, '..')).rejects.toThrow(/Invalid path parameter/);
    expect(f).not.toHaveBeenCalled();
  });
});
