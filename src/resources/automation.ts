import { pathParam } from '../http.js';
import type { ListParams, PaginatedIterable } from '../pagination.js';
import type {
  CancelWorkflowExecutionsRequest,
  RunResult,
  RunScriptRequest,
  RunTaskRequest,
  RunWorkflowRequest,
  Script,
  ScriptExecution,
  ScriptOutput,
  Task,
  TaskExecution,
  TaskExecutionDevice,
  TaskExecutionScript,
  Workflow,
  WorkflowExecution,
} from '../types/index.js';
import { BaseResource } from './base.js';

/** Automation scripts (`/automation/scripts`). */
export class ScriptsResource extends BaseResource {
  /** List scripts (single page). */
  async list(params?: ListParams): Promise<Script[]> {
    return this.getList<Script>('/automation/scripts', params);
  }

  /** Iterate over all scripts across pages. */
  listAll(params?: ListParams): PaginatedIterable<Script> {
    return this.iterate<Script>('/automation/scripts', params);
  }

  /** Get a script. */
  async get(id: string): Promise<Script> {
    return this.http.request<Script>('GET', `/automation/scripts/${pathParam(id, 'scriptId')}`);
  }

  /** Run a script on an online device. WRITE operation. */
  async run(id: string, request: RunScriptRequest): Promise<RunResult> {
    return this.http.request<RunResult>('POST', `/automation/scripts/${pathParam(id, 'scriptId')}/run`, {
      body: request,
    });
  }

  readonly executions = {
    list: async (scriptId: string, deviceId: string, params?: ListParams): Promise<ScriptExecution[]> =>
      this.getList<ScriptExecution>(
        `/automation/scripts/${pathParam(scriptId, 'scriptId')}/device/${pathParam(deviceId, 'deviceId')}/executions`,
        params,
      ),
    get: async (scriptId: string, deviceId: string, executionId: string | number): Promise<ScriptExecution> =>
      this.http.request<ScriptExecution>(
        'GET',
        `/automation/scripts/${pathParam(scriptId, 'scriptId')}/device/${pathParam(deviceId, 'deviceId')}` +
          `/executions/${pathParam(executionId, 'executionId')}`,
      ),
  };
}

/** Automation tasks (`/automation/tasks`). */
export class TasksResource extends BaseResource {
  /** List tasks (single page). */
  async list(params?: ListParams): Promise<Task[]> {
    return this.getList<Task>('/automation/tasks', params);
  }

  /** Iterate over all tasks across pages. */
  listAll(params?: ListParams): PaginatedIterable<Task> {
    return this.iterate<Task>('/automation/tasks', params);
  }

  /** Get a task. */
  async get(id: number | string): Promise<Task> {
    return this.http.request<Task>('GET', `/automation/tasks/${pathParam(id, 'taskId')}`);
  }

  /** Run a task. WRITE operation. */
  async run(id: number | string, request: RunTaskRequest = {}): Promise<RunResult> {
    return this.http.request<RunResult>('POST', `/automation/tasks/${pathParam(id, 'taskId')}/run`, {
      body: request,
    });
  }

  /** Get a task execution. */
  async getExecution(executionId: number | string): Promise<TaskExecution> {
    return this.http.request<TaskExecution>(
      'GET',
      `/automation/tasks/executions/${pathParam(executionId, 'executionId')}`,
    );
  }

  /** List devices in a task execution. */
  async executionDevices(executionId: number | string, params?: ListParams): Promise<TaskExecutionDevice[]> {
    return this.getList<TaskExecutionDevice>(
      `/automation/tasks/executions/${pathParam(executionId, 'executionId')}/devices`,
      params,
    );
  }

  /** List scripts run on a device in a task execution. */
  async executionDeviceScripts(
    executionId: number | string,
    deviceId: string,
  ): Promise<TaskExecutionScript[]> {
    return this.http.request<TaskExecutionScript[]>(
      'GET',
      `/automation/tasks/executions/${pathParam(executionId, 'executionId')}` +
        `/devices/${pathParam(deviceId, 'deviceId')}/scripts`,
    );
  }

  /** Get the output of a script run on a device. */
  async scriptOutput(executionId: number | string, deviceId: string, scriptId: string): Promise<ScriptOutput> {
    return this.http.request<ScriptOutput>(
      'GET',
      `/automation/tasks/executions/${pathParam(executionId, 'executionId')}` +
        `/devices/${pathParam(deviceId, 'deviceId')}/scripts/${pathParam(scriptId, 'scriptId')}`,
    );
  }
}

/** Automation workflows (`/automation/workflows`). */
export class WorkflowsResource extends BaseResource {
  /** List workflows (single page). */
  async list(params?: ListParams): Promise<Workflow[]> {
    return this.getList<Workflow>('/automation/workflows', params);
  }

  /** Iterate over all workflows across pages. */
  listAll(params?: ListParams): PaginatedIterable<Workflow> {
    return this.iterate<Workflow>('/automation/workflows', params);
  }

  /** Get a workflow. */
  async get(id: number | string): Promise<Workflow> {
    return this.http.request<Workflow>('GET', `/automation/workflows/${pathParam(id, 'workflowId')}`);
  }

  /** Run a workflow. WRITE operation. */
  async run(id: number | string, request: RunWorkflowRequest = {}): Promise<RunResult> {
    return this.http.request<RunResult>('POST', `/automation/workflows/${pathParam(id, 'workflowId')}/run`, {
      body: request,
    });
  }

  /** Cancel workflow executions. WRITE operation. */
  async cancelExecutions(executionIds: number[]): Promise<RunResult> {
    const body: CancelWorkflowExecutionsRequest = { ExecutionIds: executionIds };
    return this.http.request<RunResult>('POST', '/automation/workflows/executions/cancel', { body });
  }

  readonly executions = {
    list: async (params?: ListParams): Promise<WorkflowExecution[]> =>
      this.getList<WorkflowExecution>('/automation/workflows/executions', params),
    listAll: (params?: ListParams): PaginatedIterable<WorkflowExecution> =>
      this.iterate<WorkflowExecution>('/automation/workflows/executions', params),
    get: async (executionId: number | string): Promise<WorkflowExecution> =>
      this.http.request<WorkflowExecution>(
        'GET',
        `/automation/workflows/executions/${pathParam(executionId, 'executionId')}`,
      ),
  };
}

/** `client.automation` namespace. */
export class AutomationResource {
  readonly scripts: ScriptsResource;
  readonly tasks: TasksResource;
  readonly workflows: WorkflowsResource;

  /** Group the scripts, tasks and workflows resources. */
  constructor(scripts: ScriptsResource, tasks: TasksResource, workflows: WorkflowsResource) {
    this.scripts = scripts;
    this.tasks = tasks;
    this.workflows = workflows;
  }
}
