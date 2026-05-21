import { i18n } from './i18n';

export const STANDARD_LOG_TYPES = ["info", "success", "warn", "error", "action"] as const;
export type LoggerLogType = "summary" | typeof STANDARD_LOG_TYPES[number];
export type LoggerFilterType = LoggerLogType | "all";

export const LOG_TYPE_META: Record<
  LoggerLogType,
  { icon: string; color: string; label: { en: string; zh: string } }
> = {
  summary: { icon: "📌", color: "#f5d76e", label: { en: "Summary", zh: "摘要" } },
  info: { icon: "🔹", color: "#ddd", label: { en: "Info", zh: "信息" } },
  success: { icon: "✅", color: "#4caf50", label: { en: "Success", zh: "成功" } },
  warn: { icon: "⚠️", color: "#ff9800", label: { en: "Warn", zh: "警告" } },
  error: { icon: "❌", color: "#f44336", label: { en: "Error", zh: "错误" } },
  action: { icon: "⚡", color: "#00bcd4", label: { en: "Action", zh: "操作" } },
};

export function getFilterLabel(type: LoggerFilterType): string {
  if (type === "all") {
    return i18n.lang === "zh" ? "全部" : "All";
  }

  const meta = LOG_TYPE_META[type];
  return `${meta.icon} ${meta.label[i18n.lang]}`;
}
