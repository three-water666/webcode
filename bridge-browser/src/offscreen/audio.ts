const PLAY_ATTENTION_SOUND = "PLAY_ATTENTION_SOUND";

let audioContext: AudioContext | null = null;

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!isRecord(request) || request.type !== PLAY_ATTENTION_SOUND) {
    return false;
  }

  void playAttentionSound()
    .then(() => sendResponse({ success: true }))
    .catch((error) => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return true;
});

async function playAttentionSound(): Promise<void> {
  const context = getAudioContext();
  if (context.state === "suspended") {
    await context.resume();
  }

  const start = context.currentTime + 0.01;
  const output = context.createGain();
  output.gain.setValueAtTime(0.0001, start);
  output.gain.linearRampToValueAtTime(0.12, start + 0.02);
  output.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);
  output.connect(context.destination);

  playTone(context, output, 880, start, 0.16);
  playTone(context, output, 1174.66, start + 0.16, 0.24);

  window.setTimeout(() => {
    output.disconnect();
  }, 650);
}

function getAudioContext(): AudioContext {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextConstructor = window.AudioContext ?? getWebkitAudioContext();
  if (!AudioContextConstructor) {
    throw new Error("AudioContext is not available.");
  }

  audioContext = new AudioContextConstructor();
  return audioContext;
}

function getWebkitAudioContext(): typeof AudioContext | undefined {
  return (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function playTone(
  context: AudioContext,
  output: AudioNode,
  frequency: number,
  start: number,
  duration: number
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(1, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
  oscillator.addEventListener(
    "ended",
    () => {
      oscillator.disconnect();
      gain.disconnect();
    },
    { once: true }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
