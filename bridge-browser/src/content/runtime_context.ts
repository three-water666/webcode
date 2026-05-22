import type { RuntimeContextResponse } from "../types";

const NOTIFICATION_GUIDANCE =
  "Call task_completion_notification only when browser_window_in_background is true. Do not call it when the browser window is focused, foreground, or unknown.";

export function getBrowserRuntimeContext(): Promise<RuntimeContextResponse> {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      resolve(createLocalRuntimeContext("Chrome runtime is unavailable."));
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: "GET_RUNTIME_CONTEXT" }, (response: unknown) => {
        if (chrome.runtime.lastError) {
          resolve(createLocalRuntimeContext(chrome.runtime.lastError.message));
          return;
        }

        if (!isRuntimeContextResponse(response)) {
          resolve(createLocalRuntimeContext("Invalid runtime context response."));
          return;
        }

        resolve(withDocumentContext(response));
      });
    } catch (error) {
      resolve(createLocalRuntimeContext(getErrorMessage(error)));
    }
  });
}

export function isBrowserWindowInBackground(context: RuntimeContextResponse): boolean {
  return context.browser_window_in_background === true;
}

export function appendRuntimeMetadata(output: string, context: RuntimeContextResponse): string {
  return `${output}\n\n${formatRuntimeMetadata(context)}`;
}

function formatRuntimeMetadata(context: RuntimeContextResponse): string {
  return `# Webcode Runtime Metadata\n\`\`\`json\n${JSON.stringify(
    {
      webcode_runtime: {
        current_time_iso: context.current_time_iso,
        current_time_local: context.current_time_local,
        time_zone: context.time_zone,
        browser_window_focused: context.browser_window_focused,
        browser_window_in_background: context.browser_window_in_background,
        tab_active: context.tab_active,
        document_visibility_state: context.document_visibility_state,
        document_hidden: context.document_hidden,
        notification_guidance: NOTIFICATION_GUIDANCE,
      },
    },
    null,
    2
  )}\n\`\`\``;
}

function createLocalRuntimeContext(error?: string): RuntimeContextResponse {
  const now = new Date();
  return withDocumentContext({
    success: false,
    current_time_iso: now.toISOString(),
    current_time_local: now.toString(),
    time_zone: getLocalTimeZone(),
    browser_window_focused: null,
    browser_window_in_background: null,
    tab_active: null,
    window_id: null,
    tab_id: null,
    error,
  });
}

function withDocumentContext(context: RuntimeContextResponse): RuntimeContextResponse {
  if (typeof document === "undefined") {
    return context;
  }

  return {
    ...context,
    document_visibility_state: document.visibilityState,
    document_hidden: document.hidden,
  };
}

function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
}

function isRuntimeContextResponse(value: unknown): value is RuntimeContextResponse {
  if (!isRecord(value)) {return false;}

  return (
    typeof value.success === "boolean" &&
    typeof value.current_time_iso === "string" &&
    typeof value.current_time_local === "string" &&
    typeof value.time_zone === "string"
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
