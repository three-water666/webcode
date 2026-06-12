import cors from 'cors';
import type express from 'express';
import { PROTOCOL } from '@webcode/shared';

import type { GatewayConfig, GatewayLogger } from './types';

export function createCorsMiddleware(config: GatewayConfig, log: GatewayLogger): express.RequestHandler {
    return cors({
        origin: (origin, callback) => {
            if (!origin) {return callback(null, true);}

            if (origin.startsWith('chrome-extension://')) {return callback(null, true);}

            if (config.allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            if (origin.startsWith('http://127.0.0.1') || origin.startsWith('http://localhost')) {
                return callback(null, true);
            }

            log(`⛔ Blocked CORS request from: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    });
}

export function createRequestLoggerMiddleware(
    resetWatchdog: () => void,
    log: GatewayLogger,
    options: { skipWatchdogPaths?: readonly string[] } = {}
): express.RequestHandler {
    const skipWatchdogPaths = new Set(options.skipWatchdogPaths ?? []);

    return (req, res, next) => {
        if (!skipWatchdogPaths.has(req.path)) {
            resetWatchdog();
        }
        const start = Date.now();
        if (req.method !== 'OPTIONS') {
            log(`🔔 [${req.method}] ${req.url}`);
        }
        res.on('finish', () => {
            const duration = Date.now() - start;
            if (req.method !== 'OPTIONS') {
                const icon = res.statusCode >= 400 ? '❌' : '   🏁';
                log(`${icon} Status: ${res.statusCode} (${duration}ms)`);
            }
        });
        next();
    };
}

export function createAuthMiddleware(
    getAuthToken: () => string,
    log: GatewayLogger
): express.RequestHandler {
    return (req, res, next) => {
        if (req.path === '/bridge' || req.path === '/favicon.ico' || req.method === 'OPTIONS') {
            return next();
        }

        const rawClientToken = req.headers[PROTOCOL.authHeaderLowerName];
        const clientToken = Array.isArray(rawClientToken) ? rawClientToken[0] : rawClientToken;
        if (!clientToken || clientToken !== getAuthToken()) {
            log(`⛔ Unauthorized access attempt. Token: ${clientToken ?? '<missing>'}`);
            return res.status(403).json({
                isError: true,
                content: [{ type: 'text', text: "⛔ Forbidden: Invalid Security Token. Please launch from VS Code." }]
            });
        }
        next();
    };
}
