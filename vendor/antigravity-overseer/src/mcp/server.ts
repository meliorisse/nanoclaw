import type { AlertStatus } from "../types/domain.ts";
import { createRuntimeContext } from "../services/runtime.ts";
import { syncVisibleState } from "../services/visible-sync.ts";
import { validateObject, readOptionalString, readString } from "./schemas.ts";
import { listProjectsTool } from "./tools/list-projects.ts";
import { listConversationsTool } from "./tools/list-conversations.ts";
import { getConversationTool } from "./tools/get-conversation.ts";
import { getStatusTool } from "./tools/get-status.ts";
import { captureEvidenceTool } from "./tools/capture-evidence.ts";
import { sendMessageTool } from "./tools/send-message.ts";
import { listTasksTool } from "./tools/list-tasks.ts";
import { getTaskSummaryTool } from "./tools/get-task-summary.ts";
import { listAlertsTool } from "./tools/list-alerts.ts";
import { acknowledgeAlertTool } from "./tools/acknowledge-alert.ts";
import { getTaskTimelineTool } from "./tools/get-task-timeline.ts";
import { retryTaskTool } from "./tools/retry-task.ts";
import { requestVerificationTool } from "./tools/request-verification.ts";
import { createFollowupAgentTool } from "./tools/create-followup-agent.ts";
import { getScreenOverviewTool } from "./tools/get-screen-overview.ts";
import { getHealthTool } from "./tools/get-health.ts";
import { getOperationalReportTool } from "./tools/get-operational-report.ts";

async function bootstrap() {
  const runtime = await createRuntimeContext();
  const sync = await syncVisibleState(runtime);
  const overview = await runtime.adapter.getScreenOverview();

  const tasksRepository = runtime.repositories.tasks;
  const conversationsRepository = runtime.repositories.conversations;
  const taskEventsRepository = runtime.repositories.taskEvents;
  const alertsRepository = runtime.repositories.alerts;
  const supervisoryActionsRepository = runtime.repositories.supervisoryActions;
  const snapshotsRepository = runtime.repositories.snapshots;
  const projectsRepository = runtime.repositories.projects;
  const agentsRepository = runtime.repositories.agents;
  const adapter = runtime.adapter;
  const visibleProjectIds = sync.projects.map((project) => project.id);

  const tools = {
    list_projects: async () => listProjectsTool(projectsRepository, visibleProjectIds),
    list_conversations: async (args: unknown) => {
      const object = validateObject(args);
      return listConversationsTool(
        projectsRepository,
        conversationsRepository,
        readString(object.projectId, "projectId")
      );
    },
    get_conversation: async (args: unknown) => {
      const object = validateObject(args);
      return getConversationTool(
        adapter,
        conversationsRepository,
        readString(object.conversationId, "conversationId")
      );
    },
    get_status: async (args: unknown) => {
      const object = validateObject(args);
      return getStatusTool(
        adapter,
        conversationsRepository,
        readString(object.conversationId, "conversationId")
      );
    },
    get_screen_overview: async () => {
      return getScreenOverviewTool(adapter, projectsRepository, conversationsRepository);
    },
    get_health: async () => {
      return getHealthTool(runtime.config, sync, overview.data.activeConversationRef);
    },
    get_operational_report: async () => {
      return getOperationalReportTool(
        runtime.config,
        sync,
        overview.data.activeConversationRef,
        tasksRepository,
        conversationsRepository,
        alertsRepository
      );
    },
    capture_evidence: async (args: unknown) => {
      const object = validateObject(args);
      return captureEvidenceTool(adapter, {
        projectId: readOptionalString(object.projectId, "projectId"),
        conversationId: readOptionalString(object.conversationId, "conversationId"),
        taskId: readOptionalString(object.taskId, "taskId")
      });
    },
    list_tasks: async (args: unknown) => {
      const object = validateObject(args);
      const projectIdentifier = readOptionalString(object.projectId, "projectId");
      const project = projectIdentifier
        ? projectsRepository.getById(projectIdentifier) ?? projectsRepository.getByExternalRef(projectIdentifier)
        : undefined;

      return listTasksTool(tasksRepository, project?.id, visibleProjectIds);
    },
    list_alerts: async (args: unknown) => {
      const object = validateObject(args);
      return listAlertsTool(
        alertsRepository,
        readOptionalString(object.status, "status") as AlertStatus | undefined
      );
    },
    acknowledge_alert: async (args: unknown) => {
      const object = validateObject(args);
      return acknowledgeAlertTool(alertsRepository, readString(object.alertId, "alertId"));
    },
    get_task_summary: async (args: unknown) => {
      const object = validateObject(args);
      return getTaskSummaryTool(
        tasksRepository,
        conversationsRepository,
        taskEventsRepository,
        alertsRepository,
        supervisoryActionsRepository,
        snapshotsRepository,
        readString(object.taskId, "taskId")
      );
    },
    get_task_timeline: async (args: unknown) => {
      const object = validateObject(args);
      return getTaskTimelineTool(
        tasksRepository,
        taskEventsRepository,
        snapshotsRepository,
        supervisoryActionsRepository,
        readString(object.taskId, "taskId")
      );
    },
    retry_task: async (args: unknown) => {
      const object = validateObject(args);
      return retryTaskTool(tasksRepository, taskEventsRepository, supervisoryActionsRepository, {
        taskId: readString(object.taskId, "taskId"),
        instruction: readOptionalString(object.instruction, "instruction")
      });
    },
    request_verification: async (args: unknown) => {
      const object = validateObject(args);
      return requestVerificationTool(tasksRepository, taskEventsRepository, {
        taskId: readString(object.taskId, "taskId"),
        rubric: readOptionalString(object.rubric, "rubric")
      });
    },
    create_followup_agent: async (args: unknown) => {
      const object = validateObject(args);
      return createFollowupAgentTool(
        adapter,
        projectsRepository,
        conversationsRepository,
        tasksRepository,
        taskEventsRepository,
        agentsRepository,
        supervisoryActionsRepository,
        {
          projectId: readString(object.projectId, "projectId"),
          brief: readString(object.brief, "brief"),
          parentTaskId: readOptionalString(object.parentTaskId, "parentTaskId")
        }
      );
    },
    send_message: async (args: unknown) => {
      const object = validateObject(args);
      return sendMessageTool(adapter, conversationsRepository, {
        conversationId: readString(object.conversationId, "conversationId"),
        text: readString(object.text, "text")
      });
    }
  };

  return { logger: runtime.logger, tools };
}

async function main(): Promise<void> {
  const { logger, tools } = await bootstrap();
  const toolName = process.argv[2];
  const rawArgs = process.argv[3] ?? "{}";

  if (!toolName || !(toolName in tools)) {
    logger.info("Available tools", { tools: Object.keys(tools) });
    return;
  }

  const args = JSON.parse(rawArgs);
  const result = await tools[toolName as keyof typeof tools](args);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
