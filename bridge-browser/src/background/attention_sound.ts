import { getErrorMessage } from './errors';

const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const PLAY_ATTENTION_SOUND = "PLAY_ATTENTION_SOUND";

let creatingOffscreenDocument: Promise<void> | null = null;

export async function playAttentionSound(): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      type: PLAY_ATTENTION_SOUND,
    });

    if (isRecord(response) && response.success === false) {
      return {
        success: false,
        error: typeof response.error === "string" ? response.error : "Attention sound failed.",
      };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

async function ensureOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("Offscreen documents are not available.");
  }

  if (await chrome.offscreen.hasDocument()) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: "Play a short webcode attention sound.",
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  await creatingOffscreenDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
