import type { LocalTool } from './types';
import { jsonResult } from './result';

export const terminalSessionTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'terminal_session',
        description: 'Manage terminal sessions created by run_in_terminal: list sessions, read recent output, interrupt commands, or close terminals.',
        inputSchema: {
            oneOf: [
                {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['list'],
                            description: 'List visible terminal sessions created by run_in_terminal.'
                        }
                    },
                    required: ['action']
                },
                {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['read'],
                            description: 'Read recent output from a run_in_terminal session, optionally after a short delay.'
                        },
                        session_id: {
                            type: 'string',
                            minLength: 1,
                            description: 'The session id returned by run_in_terminal.'
                        },
                        tail_lines: {
                            type: 'integer',
                            minimum: 1,
                            maximum: 2000,
                            description: 'Number of recent lines to return. Default: 200.',
                            default: 200
                        },
                        delay_seconds: {
                            type: 'integer',
                            minimum: 0,
                            maximum: 10,
                            description: 'Seconds to wait before reading output. Use 0 for an immediate read. Default: 0.',
                            default: 0
                        }
                    },
                    required: ['action', 'session_id']
                },
                {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['stop', 'close'],
                            description: 'Stop interrupts the active command with Ctrl+C and keeps the terminal open. Close closes the terminal tab.'
                        },
                        session_id: {
                            type: 'string',
                            minLength: 1,
                            description: 'The session id returned by run_in_terminal.'
                        }
                    },
                    required: ['action', 'session_id']
                }
            ]
        }
    },
    async execute(args, context) {
        if (args.action === 'list') {
            return jsonResult(context.terminalSessionManager.listSessions());
        }

        if (args.action === 'read') {
            const tailLines = typeof args.tail_lines === 'number' ? args.tail_lines : 200;
            const delaySeconds = typeof args.delay_seconds === 'number' ? args.delay_seconds : 0;
            await delay(delaySeconds * 1000);
            return jsonResult(context.terminalSessionManager.readSessionOutput(String(args.session_id), tailLines));
        }

        if (args.action === 'stop') {
            return jsonResult(context.terminalSessionManager.stopSession(String(args.session_id)));
        }

        if (args.action === 'close') {
            return jsonResult(context.terminalSessionManager.closeSession(String(args.session_id)));
        }

        throw new Error('action must be one of "list", "read", "stop", or "close".');
    }
};

function delay(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) {
        return Promise.resolve();
    }

    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
}
