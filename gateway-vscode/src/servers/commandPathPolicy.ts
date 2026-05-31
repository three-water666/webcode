import * as path from 'path';
import type { CommandRiskContext, CommandRiskIssue } from './commandRiskTypes';
import type { ParsedShellCommand, ParsedShellSegment } from './shellCommandParser';

const POSIX_PATH_COMMANDS = new Set([
    'cat',
    'chmod',
    'chown',
    'cp',
    'find',
    'less',
    'mkdir',
    'more',
    'mv',
    'rm',
    'tar',
    'touch',
    'unzip',
    'zip'
]);

const POWERSHELL_PATH_COMMANDS = new Set([
    'add-content',
    'cat',
    'copy',
    'copy-item',
    'cp',
    'del',
    'dir',
    'erase',
    'gc',
    'gci',
    'get-childitem',
    'get-content',
    'ls',
    'move',
    'move-item',
    'mv',
    'new-item',
    'ni',
    'rd',
    'remove-item',
    'rm',
    'rmdir',
    'set-content',
    'type'
]);

const REMOVE_COMMANDS = new Set(['rm', 'remove-item', 'rmdir', 'rd', 'del', 'erase']);
const PATH_OPTION_NAMES = new Set(['--cwd', '--dir', '--directory', '--file', '--out-dir', '--output', '--path', '--prefix', '-c']);
const POWERSHELL_PATH_OPTIONS = new Set([
    '-destination',
    '-filepath',
    '-literalpath',
    '-out-file',
    '-outfile',
    '-path',
    '-target',
    '-workingdirectory'
]);

type PathCheckMode = 'obvious' | 'argument';

export function assessPathPolicy(parsed: ParsedShellCommand, context: CommandRiskContext = {}): CommandRiskIssue[] {
    return parsed.segments.flatMap(segment => assessSegmentPathPolicy(parsed, segment, context));
}

function assessSegmentPathPolicy(
    parsed: ParsedShellCommand,
    segment: ParsedShellSegment,
    context: CommandRiskContext
): CommandRiskIssue[] {
    const issues: CommandRiskIssue[] = [];
    issues.push(...assessCommandToken(segment, context));
    issues.push(...assessRedirections(segment, context));
    issues.push(...assessPathOptions(segment, context));
    issues.push(...assessPathCommandArguments(parsed, segment, context));
    issues.push(...assessObviousPathEscapes(segment, context));
    return issues;
}

function assessCommandToken(segment: ParsedShellSegment, context: CommandRiskContext): CommandRiskIssue[] {
    if (!segment.commandToken || !looksPathLike(segment.commandToken)) {
        return [];
    }

    return assessPathToken(segment.commandToken, context, 'obvious');
}

function assessPathCommandArguments(
    parsed: ParsedShellCommand,
    segment: ParsedShellSegment,
    context: CommandRiskContext
): CommandRiskIssue[] {
    if (!isPathCommand(parsed, segment.commandName)) {
        return [];
    }

    const args = collectCommandPathArgs(segment.args);
    const issues = args.flatMap(arg => assessPathToken(arg, context, 'argument'));
    return isRecursiveRemove(segment) ? issues.concat(assessRecursiveRemoveTargets(args)) : issues;
}

function assessObviousPathEscapes(segment: ParsedShellSegment, context: CommandRiskContext): CommandRiskIssue[] {
    return segment.args.flatMap(arg => {
        if (!isObviousPathEscape(arg)) {
            return [];
        }

        return assessPathToken(arg, context, 'obvious');
    });
}

function assessPathOptions(segment: ParsedShellSegment, context: CommandRiskContext): CommandRiskIssue[] {
    return collectPathOptionValues(segment).flatMap(value => assessPathToken(value, context, 'argument'));
}

function assessRedirections(segment: ParsedShellSegment, context: CommandRiskContext): CommandRiskIssue[] {
    return collectRedirectionTargets(segment.words).flatMap(target => assessPathToken(target, context, 'argument'));
}

function collectCommandPathArgs(args: string[]): string[] {
    return args.filter((arg, index) => isCommandPathArg(args, index));
}

function isCommandPathArg(args: string[], index: number): boolean {
    const arg = args[index];
    const previous = args[index - 1]?.toLowerCase();
    if (!arg || arg === '--') {
        return false;
    }
    if (previous && isPathOptionName(previous)) {
        return true;
    }

    return !arg.startsWith('-');
}

function collectPathOptionValues(segment: ParsedShellSegment): string[] {
    const values: string[] = [];
    for (let index = 0; index < segment.args.length; index++) {
        const arg = segment.args[index];
        const next = segment.args[index + 1];
        appendPathOptionValue(values, arg, next);
    }

    return values;
}

function appendPathOptionValue(values: string[], arg: string, next: string | undefined): void {
    const lower = arg.toLowerCase();
    if (isPathOptionName(lower) && next) {
        values.push(next);
        return;
    }
    if (lower.startsWith('-c') && lower.length > 2) {
        values.push(arg.slice(2));
        return;
    }

    const equalsIndex = arg.indexOf('=');
    if (equalsIndex > 0 && isPathOptionName(lower.slice(0, equalsIndex))) {
        values.push(arg.slice(equalsIndex + 1));
    }
}

function collectRedirectionTargets(words: string[]): string[] {
    const targets: string[] = [];
    for (let index = 0; index < words.length; index++) {
        const word = words[index];
        const inlineTarget = inlineRedirectionTarget(word);
        if (inlineTarget) {
            targets.push(inlineTarget);
            continue;
        }
        if (isRedirectionOperator(word) && words[index + 1]) {
            targets.push(words[index + 1]);
        }
    }

    return targets;
}

function inlineRedirectionTarget(word: string): string | null {
    const match = /^(?:\d*)>{1,2}(.+)$/.exec(word) ?? /^(?:\d*)<(.+)$/.exec(word);
    if (!match || match[1].startsWith('&')) {
        return null;
    }

    return match[1];
}

function assessPathToken(token: string, context: CommandRiskContext, mode: PathCheckMode): CommandRiskIssue[] {
    const candidate = normalizePathCandidate(token);
    if (!candidate || shouldSkipPathCandidate(candidate, mode)) {
        return [];
    }
    if (isDynamicPathReference(candidate)) {
        return [blocked(`Dynamic path argument "${candidate}" cannot be verified against the workspace.`)];
    }
    if (!looksPathLike(candidate) && mode === 'obvious') {
        return [];
    }

    return isPathInsideWorkspace(candidate, context)
        ? []
        : [blocked(`Path argument "${candidate}" resolves outside the VS Code workspace.`)];
}

function assessRecursiveRemoveTargets(targets: string[]): CommandRiskIssue[] {
    return targets
        .filter(isDangerousRemovalTarget)
        .map(() => dangerous('Recursive removal of workspace root, parent paths, .git, variables, or broad wildcards is not allowed.'));
}

function isPathInsideWorkspace(candidate: string, context: CommandRiskContext): boolean {
    if (!context.workspaceRoot || !context.cwd) {
        return !isObviousPathEscape(candidate);
    }

    const resolved = resolveCandidatePath(candidate, context.cwd);
    const workspaceRoot = path.resolve(path.normalize(context.workspaceRoot));
    return isInsideDirectory(resolved, workspaceRoot);
}

function resolveCandidatePath(candidate: string, cwd: string): string {
    const withoutGlob = stripGlobTail(candidate);
    return path.isAbsolute(withoutGlob)
        ? path.resolve(path.normalize(withoutGlob))
        : path.resolve(cwd, path.normalize(withoutGlob));
}

function stripGlobTail(candidate: string): string {
    const globIndex = candidate.search(/[*?]/);
    if (globIndex === -1) {
        return candidate;
    }

    const prefix = candidate.slice(0, globIndex);
    return prefix.replace(/[\\/][^\\/]*$/, '') || '.';
}

function isPathCommand(parsed: ParsedShellCommand, commandName: string): boolean {
    return parsed.shellKind === 'powershell'
        ? POWERSHELL_PATH_COMMANDS.has(commandName)
        : POSIX_PATH_COMMANDS.has(commandName);
}

function isRecursiveRemove(segment: ParsedShellSegment): boolean {
    return REMOVE_COMMANDS.has(segment.commandName) && segment.args.some(isRecursiveFlag);
}

function isRecursiveFlag(arg: string): boolean {
    const lower = arg.toLowerCase();
    return lower === '--recursive' || lower === '-recurse' || lower === '-recursive' || /^-[^-]*r/i.test(arg);
}

function isDangerousRemovalTarget(target: string): boolean {
    const lower = target.toLowerCase();
    const exactTargets = new Set(['/', '~', '.', '..', '*', './*', '/*', '~/*', '.git', '$pwd', '$home']);
    return exactTargets.has(lower)
        || lower.startsWith('../')
        || lower.startsWith('..\\')
        || lower.startsWith('$')
        || lower.includes('/.git')
        || lower.includes('\\.git')
        || /^[a-z]:[\\/]*$/i.test(target);
}

function normalizePathCandidate(token: string): string {
    return token.trim().replace(/^file:\/\//i, '');
}

function shouldSkipPathCandidate(candidate: string, mode: PathCheckMode): boolean {
    return candidate === ''
        || candidate === '-'
        || candidate === '--'
        || isNonFileUrl(candidate)
        || (mode === 'obvious' && !isObviousPathEscape(candidate));
}

function isObviousPathEscape(candidate: string): boolean {
    return startsWithParentPath(candidate)
        || startsWithHomePath(candidate)
        || isAbsolutePath(candidate)
        || isHomeEnvironmentPath(candidate);
}

function looksPathLike(candidate: string): boolean {
    return candidate === '.'
        || candidate === '..'
        || candidate.includes('/')
        || candidate.includes('\\')
        || candidate.startsWith('~')
        || /^[a-z]:/i.test(candidate);
}

function startsWithParentPath(candidate: string): boolean {
    return candidate === '..'
        || candidate.startsWith('../')
        || candidate.startsWith('..\\')
        || candidate.includes('/../')
        || candidate.includes('\\..\\');
}

function startsWithHomePath(candidate: string): boolean {
    return candidate === '~' || candidate.startsWith('~/') || candidate.startsWith('~\\');
}

function isHomeEnvironmentPath(candidate: string): boolean {
    const lower = candidate.toLowerCase();
    return lower.startsWith('$home')
        || lower.startsWith('${home}')
        || lower.startsWith('$env:userprofile')
        || lower.startsWith('%userprofile%')
        || lower.startsWith('%homepath%');
}

function isAbsolutePath(candidate: string): boolean {
    return path.isAbsolute(candidate) || /^[a-z]:[\\/]/i.test(candidate);
}

function isDynamicPathReference(candidate: string): boolean {
    return candidate.startsWith('$') || candidate.startsWith('%');
}

function isNonFileUrl(candidate: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) && !candidate.toLowerCase().startsWith('file://');
}

function isRedirectionOperator(word: string): boolean {
    return /^(?:\d*)>{1,2}$/.test(word) || /^(?:\d*)<$/.test(word);
}

function isPathOptionName(value: string): boolean {
    return PATH_OPTION_NAMES.has(value) || POWERSHELL_PATH_OPTIONS.has(value);
}

function isInsideDirectory(filePath: string, directory: string): boolean {
    const normalizedPath = path.resolve(path.normalize(filePath));
    const normalizedDirectory = path.resolve(path.normalize(directory));
    return normalizedPath === normalizedDirectory
        || normalizedPath.startsWith(normalizedDirectory.endsWith(path.sep) ? normalizedDirectory : `${normalizedDirectory}${path.sep}`);
}

function blocked(reason: string): CommandRiskIssue {
    return { level: 'blocked', reason };
}

function dangerous(reason: string): CommandRiskIssue {
    return { level: 'dangerous', reason };
}
