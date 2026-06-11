export interface SessionPresetSettings {
  defaultAutoApproveTools: boolean;
}

const SESSION_PRESET_SETTINGS_KEY = "sessionPresetSettings";

const DEFAULT_SESSION_PRESET_SETTINGS: SessionPresetSettings = {
  defaultAutoApproveTools: false,
};

export async function getSessionPresetSettings(): Promise<SessionPresetSettings> {
  const result = await chrome.storage.local.get([SESSION_PRESET_SETTINGS_KEY]) as Record<string, unknown>;
  return normalizeSessionPresetSettings(result[SESSION_PRESET_SETTINGS_KEY]);
}

export async function updateDefaultAutoApproveTools(defaultAutoApproveTools: boolean): Promise<SessionPresetSettings> {
  const currentSettings = await getSessionPresetSettings();
  const nextSettings: SessionPresetSettings = {
    ...currentSettings,
    defaultAutoApproveTools,
  };

  await chrome.storage.local.set({
    [SESSION_PRESET_SETTINGS_KEY]: nextSettings,
  });

  return nextSettings;
}

function normalizeSessionPresetSettings(value: unknown): SessionPresetSettings {
  if (!isRecord(value)) {
    return DEFAULT_SESSION_PRESET_SETTINGS;
  }

  return {
    defaultAutoApproveTools: value.defaultAutoApproveTools === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
