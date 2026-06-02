export function formatSearchResultsLimitedNotice(
    toolName: string,
    maxResults: number,
    itemLabel: string,
    followUpHint: string
): string {
    return `[${toolName}] Results limited to ${maxResults} ${itemLabel}. There may be more results. ${followUpHint}`;
}
