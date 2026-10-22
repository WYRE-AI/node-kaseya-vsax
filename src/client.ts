/**
 * Main Kaseya VSA X client.
 */

import { resolveConfig, type KaseyaVsaxConfig } from './config.js';
import { HttpClient, type RateLimitInfo } from './http.js';
import { AssetsResource } from './resources/assets.js';
import {
  AutomationResource,
  ScriptsResource,
  TasksResource,
  WorkflowsResource,
} from './resources/automation.js';
import { DevicesResource } from './resources/devices.js';
import {
  AuditLogsResource,
  CustomFieldsResource,
  EndpointProtectionResource,
  EnvironmentResource,
  PatchManagementResource,
  RateLimitsResource,
  ScopesResource,
} from './resources/misc.js';
import { NotificationsResource } from './resources/notifications.js';
import { GroupsResource, OrganizationsResource, SitesResource } from './resources/organizations.js';

/**
 * Kaseya VSA X (VSA 10) REST API v3 client.
 *
 * @example
 * ```typescript
 * const client = new KaseyaVsaxClient({
 *   serverUrl: 'acme.vsax.net',
 *   tokenId: process.env.VSAX_TOKEN_ID!,
 *   tokenSecret: process.env.VSAX_TOKEN_SECRET!,
 * });
 * for await (const device of client.devices.listAll()) console.log(device.Name);
 * ```
 */
export class KaseyaVsaxClient {
  // Credentials live only inside HttpClient's private (#) fields; the raw
  // config is deliberately not retained on the client.
  readonly #http: HttpClient;

  readonly devices: DevicesResource;
  readonly assets: AssetsResource;
  readonly automation: AutomationResource;
  readonly notifications: NotificationsResource;
  readonly organizations: OrganizationsResource;
  readonly sites: SitesResource;
  readonly groups: GroupsResource;
  readonly customFields: CustomFieldsResource;
  readonly scopes: ScopesResource;
  readonly patchManagement: PatchManagementResource;
  readonly endpointProtection: EndpointProtectionResource;
  readonly environment: EnvironmentResource;
  readonly auditLogs: AuditLogsResource;
  readonly rateLimits: RateLimitsResource;

  constructor(config: KaseyaVsaxConfig) {
    const http = new HttpClient(resolveConfig(config));
    this.#http = http;

    this.devices = new DevicesResource(http);
    this.assets = new AssetsResource(http);
    this.automation = new AutomationResource(
      new ScriptsResource(http),
      new TasksResource(http),
      new WorkflowsResource(http),
    );
    this.notifications = new NotificationsResource(http);
    this.organizations = new OrganizationsResource(http);
    this.sites = new SitesResource(http);
    this.groups = new GroupsResource(http);
    this.customFields = new CustomFieldsResource(http);
    this.scopes = new ScopesResource(http);
    this.patchManagement = new PatchManagementResource(http);
    this.endpointProtection = new EndpointProtectionResource(http);
    this.environment = new EnvironmentResource(http);
    this.auditLogs = new AuditLogsResource(http);
    this.rateLimits = new RateLimitsResource(http);
  }

  /** Normalized tenant base URL (`https://<host>/api/v3`). */
  get baseUrl(): string {
    return `https://${this.#http.host}/api/v3`;
  }

  /** Rate-limit headers from the most recent response that carried them. */
  get lastRateLimit(): RateLimitInfo | undefined {
    return this.#http.lastRateLimit;
  }

  /** Whether the auth circuit breaker is open. */
  get authCircuitOpen(): boolean {
    return this.#http.authCircuitOpen;
  }

  /** Manually close the auth circuit breaker (e.g. after rotating the token). */
  resetAuthCircuit(): void {
    this.#http.resetAuthCircuit();
  }
}
