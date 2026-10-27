import type { JsonObject, Loose } from './common.js';

export interface VariableOverride {
  Name: string;
  Value: string;
}

export interface Script {
  Id: string;
  Name?: string;
  Description?: string;
  CategoryId?: number;
  CategoryName?: string;
  Platforms?: string[];
  CreatedBy?: string;
  IsBuiltIn?: boolean;
  FolderPath?: string;
}

export interface RunScriptRequest {
  /** Device on which the script runs; must be online. */
  DeviceIdentifier: string;
  WebhookUrl?: string;
  [param: string]: unknown;
}

export type ScriptExecution = JsonObject;
export type RunResult = JsonObject;

export interface Task {
  Id: number;
  Name?: string;
  Description?: string;
  IsEnabled?: boolean;
  ScopeId?: number;
  ScopeName?: string;
  UpdatedAt?: string;
  IsScheduled?: boolean;
  TotalScripts?: number;
  IsBuiltIn?: boolean;
  ContinueOnError?: boolean;
  ExecutionState?: Loose<'Idle' | 'Running'>;
  FolderPath?: string;
}

export interface RunTaskRequest {
  /** If omitted, the task runs on its configured scope. */
  DeviceIdentifiers?: string[];
  WebhookUrl?: string;
}

export interface TaskExecution {
  [key: string]: unknown;
}

export interface TaskExecutionDevice {
  Identifier: string;
  Name?: string;
  GroupName?: string;
  Description?: string;
  ExecutionStatus?: string;
}

export interface TaskExecutionScript {
  Id: string;
  Name?: string;
  FolderPath?: string;
  Description?: string;
  IsSuccessful?: boolean;
}

export type ScriptOutput = JsonObject;

export interface Workflow {
  Id: number;
  Name?: string;
  Description?: string;
  IsEnabled?: boolean;
  TriggerType?: string;
  TriggerSubType?: string;
  UpdatedAt?: string;
  ContextType?: Loose<'Scope' | 'Organization' | 'Device' | 'Deviceless'>;
  ContextItemId?: string;
  FolderPath?: string;
}

export interface RunWorkflowRequest {
  DeviceIdentifiers?: string[];
  WebhookUrl?: string;
  ConstantVariableOverrides?: VariableOverride[];
}

export interface WorkflowExecution {
  Id: number;
  WorkflowId?: number;
  TargetType?: Loose<'Device' | 'Server'>;
  TargetId?: string;
  TriggerType?: string;
  TriggerId?: string;
  Status?: Loose<'Pending' | 'Running' | 'Success' | 'Failed'>;
  CreatedAt?: string;
  CompletedAt?: string;
  ConstantVariableOverrides?: VariableOverride[];
  ExecutionSteps?: JsonObject[];
  FolderPath?: string;
}

export interface CancelWorkflowExecutionsRequest {
  ExecutionIds: number[];
}
