export type SearchCodeOptions = {
    searchRoot: string;
    workspaceRoot: string;
    query: string;
    maxResults: number;
    includePattern?: string;
    excludePatterns: string[];
    caseSensitive: boolean;
    useRegex: boolean;
    matchLineMaxChars: number;
};
