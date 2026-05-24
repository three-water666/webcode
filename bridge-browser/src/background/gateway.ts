import { PROTOCOL } from '@webcode/shared';

import { getSession } from './sessions';

export async function executeTool(request: any, tabId: number | null | undefined) {
  if (!tabId) {return { success: false, error: "No Session Tab" };}
  const session = await getSession(tabId);
  if (!session) {
    return {
      success: false,
      error: "Session Lost. Please reconnect from VS Code.",
    };
  }
  const { port, token } = session;
  const apiEndpoint = `http://127.0.0.1:${port}/v1/tools/call`;
  try {
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [PROTOCOL.authHeaderName]: token,
      },
      body: JSON.stringify({
        name: request.payload.name,
        arguments: request.payload.arguments ?? {},
      }),
    });
    if (response.ok) {
      const resJson = await response.json();
      const textContent = formatGatewayToolContent(resJson);
      if (resJson?.isError === true) {
        return {
          success: false,
          error: textContent || "Tool execution failed.",
        };
      }
      return { success: true, data: textContent };
    }
    if (response.status === 403) {
      return { success: false, error: "Session Expired/Invalid Token." };
    }
    const errorText = await readGatewayError(response);
    return {
      success: false,
      error: errorText || `${response.status} - ${response.statusText}`,
    };
  } catch (err: any) {
    return { success: false, error: `Connection Failed: ${err.message}` };
  }
}

function formatGatewayToolContent(result: any): string {
  if (Array.isArray(result?.content)) {
    return result.content.map((item: any) => item?.text ?? "").filter(Boolean).join("\n");
  }
  return JSON.stringify(result);
}

async function readGatewayError(response: Response): Promise<string> {
  try {
    const resJson = await response.json();
    if (Array.isArray(resJson?.content)) {
      return formatGatewayToolContent(resJson);
    }
    if (typeof resJson?.error === "string") {
      return resJson.error;
    }
    return JSON.stringify(resJson);
  } catch {
    return `${response.status} - ${response.statusText}`;
  }
}
