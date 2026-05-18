import type { LocalTool } from './types';
import { errorResult, jsonResult } from './result';

export const terminalSessionTool: LocalTool = {
    serverId: 'internal',
    definition: {
        name: 'terminal_session',
        description: 'Manage terminal sessions created by run_in_terminal: list sessions, read recent output, or stop a session.',
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
                            description: 'Read recent output from a run_in_terminal session.'
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
                        }
                    },
                    required: ['action', 'session_id']
                },
                {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: ['stop'],
                            description: 'Stop a run_in_terminal session.'
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
        try {
            if (args.action === 'list') {
                return jsonResult(context.terminalSessionManager.listSessions());
            }

            if (args.action === 'read') {
                const tailLines = typeof args.tail_lines === 'number' ? args.tail_lines : 200;
                return jsonResult(context.terminalSessionManager.readSessionOutput(String(args.session_id), tailLines));
            }

            if (args.action === 'stop') {
                return jsonResult(context.terminalSessionManager.stopSession(String(args.session_id)));
            }

            return errorResult('Error: action must be one of "list", "read", or "stop".');
        } catch (error: any) {
            return errorResult(`Error: ${error.message}`);
        }
    }
};
