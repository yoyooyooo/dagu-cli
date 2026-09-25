#!/usr/bin/env python3
"""Build spec/commands.json. Every OpenAPI operationId appears once."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / "spec/openapi.json").read_text())

# argv words, then operationId. Path parameters stay positional in OpenAPI order.
PAIRS = [
    ("run artifact list", "ListArtifacts"),
    ("run list", "ListDAGRuns"),
    ("run start spec", "ExecuteDAGRunFromSpec"),
    ("run enqueue spec", "EnqueueDAGRunFromSpec"),
    ("run list dag", "ListDAGRunsByName"),
    ("run delete", "DeleteDAGRun"),
    ("run get", "GetDAGRunDetails"),
    ("run artifact get", "GetDAGRunArtifacts"),
    ("run artifact download", "DownloadDAGRunArtifact"),
    ("run artifact preview", "GetDAGRunArtifactPreview"),
    ("run dequeue", "DequeueDAGRun"),
    ("run edit-retry", "EditRetryDAGRun"),
    ("run edit-retry preview", "PreviewEditRetryDAGRun"),
    ("run human resume", "ResumeHumanTaskDAGRun"),
    ("run human complete", "CompleteHumanTask"),
    ("run log", "GetDAGRunLog"),
    ("run log download", "DownloadDAGRunLog"),
    ("run outputs", "GetDAGRunOutputs"),
    ("run reschedule", "RescheduleDAGRun"),
    ("run retry", "RetryDAGRun"),
    ("run spec", "GetDAGRunSpec"),
    ("run step logs download", "DownloadDAGRunStepLogs"),
    ("run step logs form", "DownloadDAGRunStepLogsForm"),
    ("run step agent respond", "RespondDAGRunStepAgentInteraction"),
    ("run step agent restart", "RestartDAGRunStepAgentSession"),
    ("run step approve", "ApproveDAGRunStep"),
    ("run step log", "GetDAGRunStepLog"),
    ("run step log download", "DownloadDAGRunStepLog"),
    ("run step messages", "GetDAGRunStepMessages"),
    ("run step push-back", "PushBackDAGRunStep"),
    ("run step reject", "RejectDAGRunStep"),
    ("run step status", "UpdateDAGRunStepStatus"),
    ("run stop", "TerminateDAGRun"),
    ("run sub list", "GetSubDAGRuns"),
    ("run sub get", "GetSubDAGRunDetails"),
    ("run sub artifact get", "GetSubDAGRunArtifacts"),
    ("run sub artifact download", "DownloadSubDAGRunArtifact"),
    ("run sub artifact preview", "GetSubDAGRunArtifactPreview"),
    ("run sub log", "GetSubDAGRunLog"),
    ("run sub log download", "DownloadSubDAGRunLog"),
    ("run sub spec", "GetSubDAGRunSpec"),
    ("run sub step logs download", "DownloadSubDAGRunStepLogs"),
    ("run sub step logs form", "DownloadSubDAGRunStepLogsForm"),
    ("run sub step agent respond", "RespondSubDAGRunStepAgentInteraction"),
    ("run sub step agent restart", "RestartSubDAGRunStepAgentSession"),
    ("run sub step approve", "ApproveSubDAGRunStep"),
    ("run sub step log", "GetSubDAGRunStepLog"),
    ("run sub step log download", "DownloadSubDAGRunStepLog"),
    ("run sub step messages", "GetSubDAGRunStepMessages"),
    ("run sub step push-back", "PushBackSubDAGRunStep"),
    ("run sub step reject", "RejectSubDAGRunStep"),
    ("run sub step status", "UpdateSubDAGRunStepStatus"),
    ("dag list", "ListDAGs"),
    ("dag create", "CreateNewDAG"),
    ("dag labels", "GetAllDAGLabels"),
    ("dag search", "SearchDAGs"),
    ("dag tags", "GetAllDAGTags"),
    ("dag validate", "ValidateDAGSpec"),
    ("dag delete", "DeleteDAG"),
    ("dag get", "GetDAGDetails"),
    ("dag history", "GetDAGDAGRunHistory"),
    ("dag history get", "GetDAGDAGRunDetails"),
    ("dag enqueue", "EnqueueDAGDAGRun"),
    ("dag rename", "RenameDAG"),
    ("dag settings delete", "DeleteDAGSettings"),
    ("dag settings get", "GetDAGSettings"),
    ("dag settings put", "UpdateDAGSettings"),
    ("dag spec get", "GetDAGSpec"),
    ("dag spec put", "UpdateDAGSpec"),
    ("dag start", "ExecuteDAG"),
    ("dag start sync", "ExecuteDAGSync"),
    ("dag stop", "StopAllDAGRuns"),
    ("dag suspend", "UpdateDAGSuspensionState"),
    ("profile list", "ListRuntimeProfiles"),
    ("profile create", "CreateRuntimeProfile"),
    ("profile global get", "GetGlobalRuntimeProfileDefaults"),
    ("profile global update", "UpdateGlobalRuntimeProfileDefaults"),
    ("profile global entry delete", "DeleteGlobalRuntimeProfileDefaultEntry"),
    ("profile global secret put", "SetGlobalRuntimeProfileDefaultSecret"),
    ("profile global variable put", "SetGlobalRuntimeProfileDefaultVariable"),
    ("profile workspace get", "GetWorkspaceRuntimeProfileDefaults"),
    ("profile workspace update", "UpdateWorkspaceRuntimeProfileDefaults"),
    ("profile workspace entry delete", "DeleteWorkspaceRuntimeProfileDefaultEntry"),
    ("profile workspace secret put", "SetWorkspaceRuntimeProfileDefaultSecret"),
    ("profile workspace variable put", "SetWorkspaceRuntimeProfileDefaultVariable"),
    ("profile delete", "DeleteRuntimeProfile"),
    ("profile get", "GetRuntimeProfile"),
    ("profile update", "UpdateRuntimeProfile"),
    ("profile entry delete", "DeleteRuntimeProfileEntry"),
    ("profile secret put", "SetRuntimeProfileSecret"),
    ("profile variable put", "SetRuntimeProfileVariable"),
    ("notify dag delete", "DeleteDAGNotifications"),
    ("notify dag get", "GetDAGNotifications"),
    ("notify dag put", "UpdateDAGNotifications"),
    ("notify dag test", "TestDAGNotifications"),
    ("notify channel list", "ListNotificationChannels"),
    ("notify channel create", "CreateNotificationChannel"),
    ("notify channel delete", "DeleteNotificationChannel"),
    ("notify channel get", "GetNotificationChannel"),
    ("notify channel put", "UpdateNotificationChannel"),
    ("notify channel test", "TestNotificationChannel"),
    ("notify route list", "ListNotificationRoutes"),
    ("notify route global get", "GetGlobalNotificationRoutes"),
    ("notify route global put", "UpdateGlobalNotificationRoutes"),
    ("notify route workspace get", "GetWorkspaceNotificationRoutes"),
    ("notify route workspace put", "UpdateWorkspaceNotificationRoutes"),
    ("notify settings get", "GetNotificationSettings"),
    ("notify settings put", "UpdateNotificationSettings"),
    ("sync cleanup", "SyncCleanup"),
    ("sync config get", "GetSyncConfig"),
    ("sync config put", "UpdateSyncConfig"),
    ("sync delete batch", "SyncDeleteBatch"),
    ("sync delete missing", "SyncDeleteMissing"),
    ("sync item delete", "DeleteSyncItem"),
    ("sync diff", "GetSyncItemDiff"),
    ("sync discard", "DiscardSyncItemChanges"),
    ("sync forget", "ForgetSyncItem"),
    ("sync move", "MoveSyncItem"),
    ("sync publish", "PublishSyncItem"),
    ("sync publish all", "SyncPublishAll"),
    ("sync pull", "SyncPull"),
    ("sync status", "GetSyncStatus"),
    ("sync test", "SyncTestConnection"),
    ("incident dag delete", "DeleteDAGIncidents"),
    ("incident dag get", "GetDAGIncidents"),
    ("incident dag put", "UpdateDAGIncidents"),
    ("incident policy list", "ListIncidentPolicies"),
    ("incident policy global get", "GetGlobalIncidentPolicies"),
    ("incident policy global put", "UpdateGlobalIncidentPolicies"),
    ("incident policy workspace get", "GetWorkspaceIncidentPolicies"),
    ("incident policy workspace put", "UpdateWorkspaceIncidentPolicies"),
    ("incident provider list", "ListIncidentProviders"),
    ("incident provider create", "CreateIncidentProvider"),
    ("incident provider delete", "DeleteIncidentProvider"),
    ("incident provider get", "GetIncidentProvider"),
    ("incident provider put", "UpdateIncidentProvider"),
    ("incident provider test", "TestIncidentProvider"),
    ("wiki list", "ListWikiPages"),
    ("wiki create", "CreateWikiPage"),
    ("wiki backlinks", "ListWikiPageBacklinks"),
    ("wiki delete batch", "DeleteWikiPageBatch"),
    ("wiki delete", "DeleteWikiPage"),
    ("wiki get", "GetWikiPage"),
    ("wiki update", "UpdateWikiPage"),
    ("wiki attachment get", "DownloadWikiPageAttachment"),
    ("wiki attachment put", "UploadWikiPageAttachment"),
    ("wiki rename", "RenameWikiPage"),
    ("wiki revision get", "GetWikiPageRevision"),
    ("wiki revision list", "ListWikiPageRevisions"),
    ("wiki search", "SearchWikiPages"),
    ("admin system health", "GetHealthStatus"),
    ("admin system license activate", "ActivateLicense"),
    ("admin system license deactivate", "DeactivateLicense"),
    ("admin system license status", "GetLicenseStatus"),
    ("admin system openapi", "GetOpenapiJson"),
    ("admin system coordinator", "GetCoordinatorStatus"),
    ("admin system resources", "GetResourceHistory"),
    ("admin system scheduler", "GetSchedulerStatus"),
    ("admin system scheduler pause get", "GetSchedulerPauseState"),
    ("admin system scheduler pause put", "UpdateSchedulerPauseState"),
    ("admin system tunnel", "GetTunnelStatus"),
    ("admin system workers", "GetWorkers"),
    ("webhook delete", "DeleteDAGWebhook"),
    ("webhook get", "GetDAGWebhook"),
    ("webhook create", "CreateDAGWebhook"),
    ("webhook hmac configure", "ConfigureDAGWebhookHMAC"),
    ("webhook hmac disable", "DisableDAGWebhookHMAC"),
    ("webhook hmac enable", "EnableDAGWebhookHMAC"),
    ("webhook hmac regenerate", "RegenerateDAGWebhookHMACSecret"),
    ("webhook profile", "ConfigureDAGWebhookProfileSelection"),
    ("webhook regenerate", "RegenerateDAGWebhookToken"),
    ("webhook toggle", "ToggleDAGWebhook"),
    ("webhook list", "ListWebhooks"),
    ("webhook trigger", "TriggerWebhook"),
    ("secret list", "ListSecrets"),
    ("secret create", "CreateSecret"),
    ("secret delete", "DeleteSecret"),
    ("secret get", "GetSecret"),
    ("secret update", "UpdateSecret"),
    ("secret disable", "DisableSecret"),
    ("secret enable", "EnableSecret"),
    ("secret version", "WriteSecretVersion"),
    ("admin remote-node list", "ListRemoteNodes"),
    ("admin remote-node create", "CreateRemoteNode"),
    ("admin remote-node delete", "DeleteRemoteNode"),
    ("admin remote-node get", "GetRemoteNode"),
    ("admin remote-node update", "UpdateRemoteNode"),
    ("admin remote-node test", "TestRemoteNodeConnection"),
    ("admin user list", "ListUsers"),
    ("admin user create", "CreateUser"),
    ("admin user delete", "DeleteUser"),
    ("admin user get", "GetUser"),
    ("admin user update", "UpdateUser"),
    ("admin user password", "ResetUserPassword"),
    ("admin api-key list", "ListAPIKeys"),
    ("admin api-key create", "CreateAPIKey"),
    ("admin api-key delete", "DeleteAPIKey"),
    ("admin api-key get", "GetAPIKey"),
    ("admin api-key update", "UpdateAPIKey"),
    ("admin view list", "ListViews"),
    ("admin view create", "CreateView"),
    ("admin view delete", "DeleteView"),
    ("admin view get", "GetView"),
    ("admin view update", "UpdateView"),
    ("admin workspace list", "ListWorkspaces"),
    ("admin workspace create", "CreateWorkspace"),
    ("admin workspace delete", "DeleteWorkspace"),
    ("admin workspace get", "GetWorkspace"),
    ("admin workspace update", "UpdateWorkspace"),
    ("admin auth password", "ChangePassword"),
    ("admin auth login", "Login"),
    ("admin auth me", "GetCurrentUser"),
    ("admin auth setup", "Setup"),
    ("search dag", "SearchDAGFeed"),
    ("search dag matches", "SearchDagMatches"),
    ("search wiki", "SearchWikiPageFeed"),
    ("search wiki matches", "SearchWikiPageMatches"),
    ("admin settings base get", "GetBaseConfig"),
    ("admin settings base put", "UpdateBaseConfig"),
    ("admin settings workspace get", "GetWorkspaceBaseConfig"),
    ("admin settings workspace put", "UpdateWorkspaceBaseConfig"),
    ("queue list", "ListQueues"),
    ("queue get", "GetQueue"),
    ("queue items", "ListQueueItems"),
    ("admin audit list", "ListAuditLogs"),
    ("admin event list", "ListEventLogs"),
    ("admin metrics get", "GetMetrics"),
]

METHODS = {"get", "post", "put", "patch", "delete"}
PARAMS = SPEC["components"]["parameters"]


def resolve(parameter):
    if "$ref" in parameter:
        return PARAMS[parameter["$ref"].rsplit("/", 1)[-1]]
    return parameter


OPERATIONS = {}
for path, item in SPEC["paths"].items():
    for method, operation in item.items():
        if method not in METHODS or "operationId" not in operation:
            continue
        path_params = []
        query_params = []
        header_params = []
        for parameter in operation.get("parameters") or []:
            resolved = resolve(parameter)
            location = resolved.get("in")
            name = resolved["name"]
            if location == "path":
                path_params.append(name)
            elif location == "query":
                query_params.append(name)
            elif location == "header":
                header_params.append(name)
        content = (operation.get("requestBody") or {}).get("content") or {}
        if "application/octet-stream" in content:
            body = "bytes"
        elif "application/x-www-form-urlencoded" in content:
            body = "form"
        elif "application/json" in content:
            body = "json"
        else:
            body = "none"
        OPERATIONS[operation["operationId"]] = {
            "method": method.upper(),
            "path": path,
            "summary": operation.get("summary") or "",
            "pathParams": path_params,
            "queryParams": query_params,
            "headerParams": header_params,
            "body": body,
        }


def skill_for(argv):
    if argv[0] == "admin":
        return "admin"
    if argv[0] == "run" and len(argv) > 1 and argv[1] in {"step", "sub", "human", "artifact"}:
        return "run"
    if argv[0] in {"dag", "run"}:
        return "core"
    return argv[0]


seen = set()
commands = []
for words, operation_id in PAIRS:
    if operation_id in seen:
        raise SystemExit(f"duplicate operation {operation_id}")
    if operation_id not in OPERATIONS:
        raise SystemExit(f"unknown operation {operation_id}")
    seen.add(operation_id)
    argv = words.split()
    commands.append({"argv": argv, "operationId": operation_id, "skill": skill_for(argv), **OPERATIONS[operation_id]})

missing = sorted(set(OPERATIONS) - seen)
extra = sorted(seen - set(OPERATIONS))
argv_keys = [" ".join(command["argv"]) for command in commands]
if len(argv_keys) != len(set(argv_keys)):
    raise SystemExit("duplicate command path")
if missing or extra:
    raise SystemExit(f"missing={missing} extra={extra}")

commands.sort(key=lambda command: command["argv"])
(ROOT / "spec/commands.json").write_text(json.dumps(commands, indent=2) + "\n")
print(f"commands {len(commands)}")
