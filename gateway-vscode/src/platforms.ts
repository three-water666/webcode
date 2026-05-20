export interface AISiteConfig {
    name: string;
    address: string;
    showQuickLaunch?: boolean;
    browser?: string;
    selectors?: Partial<SiteSelectors>;
}

export type BuiltinPlatformId = 'chatgpt' | 'gemini' | 'aistudio' | 'deepseek' | 'glm' | 'claude';

export interface SiteSelectors {
    messageBlocks: string;
    codeBlocks: string;
    inputArea: string;
    sendButton: string;
    stopButton: string;
    maxInlineChars?: number;
}

interface BuiltinPlatformDefinition {
    id: BuiltinPlatformId;
    defaultSite: AISiteConfig;
    addressIncludes: string[];
    selectors: SiteSelectors;
}

const BUILTIN_PLATFORMS: BuiltinPlatformDefinition[] = [
    {
        id: 'chatgpt',
        defaultSite: {
            name: 'ChatGPT',
            address: 'https://chatgpt.com',
            showQuickLaunch: true
        },
        addressIncludes: ['chatgpt.com', 'openai.com'],
        selectors: {
            messageBlocks: '.agent-turn',
            codeBlocks: 'pre code',
            inputArea: '#prompt-textarea',
            sendButton: 'button[data-testid="send-button"]',
            stopButton: 'button[data-testid="stop-button"]'
        }
    },
    {
        id: 'gemini',
        defaultSite: {
            name: 'Gemini',
            address: 'https://gemini.google.com',
            showQuickLaunch: true
        },
        addressIncludes: ['gemini.google.com'],
        selectors: {
            messageBlocks: '.markdown',
            codeBlocks: 'pre code',
            inputArea: 'div[contenteditable="true"]',
            sendButton: 'button[aria-label="发送"], button[aria-label="Send"], button[aria-label*="Send"]',
            stopButton: 'button[aria-label*="Stop"], button[aria-label*="停止"]'
        }
    },
    {
        id: 'aistudio',
        defaultSite: {
            name: 'aistudio',
            address: 'https://aistudio.google.com/',
            showQuickLaunch: true
        },
        addressIncludes: ['aistudio.google.com'],
        selectors: {
            messageBlocks: "div[data-turn-role='Model']",
            codeBlocks: 'pre code',
            inputArea: 'textarea',
            sendButton: 'ms-run-button button',
            stopButton: 'ms-run-button button:has(.spin)'
        }
    },
    {
        id: 'deepseek',
        defaultSite: {
            name: 'DeepSeek',
            address: 'https://chat.deepseek.com',
            showQuickLaunch: true
        },
        addressIncludes: ['deepseek.com'],
        selectors: {
            messageBlocks: '.ds-message',
            codeBlocks: '.ds-markdown.ds-assistant-message-main-content pre',
            inputArea: 'textarea.ds-scroll-area',
            sendButton: "div[role='button']:has(path[d^='M8.3125'])",
            stopButton: "div[role='button']:has(path[d^='M2 4.88'])"
        }
    },
    {
        id: 'glm',
        defaultSite: {
            name: 'GLM',
            address: 'https://chatglm.cn/',
            showQuickLaunch: true
        },
        addressIncludes: ['chatglm.cn'],
        selectors: {
            messageBlocks: '.code-box.flex1 > .answer-content-wrap',
            codeBlocks: 'pre code',
            inputArea: 'textarea.scroll-display-none',
            sendButton: '.enter.is-main-chat.m-three-row',
            stopButton: '.enter.is-main-chat.searching',
            maxInlineChars: 20000
        }
    },
    {
        id: 'claude',
        defaultSite: {
            name: 'Claude',
            address: 'https://claude.ai/',
            showQuickLaunch: true
        },
        addressIncludes: ['claude.ai'],
        selectors: {
            messageBlocks: '.font-claude-response',
            codeBlocks: 'pre code',
            inputArea: 'div[contenteditable="true"]',
            sendButton: 'button[aria-label="Send message"]',
            stopButton: 'button[aria-label="Stop response"]',
        }
    }
];

export function getBuiltinAiSites(): AISiteConfig[] {
    return BUILTIN_PLATFORMS.map(platform => ({ ...platform.defaultSite }));
}

export function getConfiguredAiSites(configuredSites: AISiteConfig[] | undefined): AISiteConfig[] {
    const builtinSites = getBuiltinAiSites();

    if (!configuredSites || configuredSites.length === 0) {
        return builtinSites;
    }

    const configuredByName = new Map(
        configuredSites.map(site => [normalizeSiteName(site.name), site] as const)
    );

    const mergedBuiltinSites = builtinSites.map(site => {
        const override = configuredByName.get(normalizeSiteName(site.name));
        if (!override) {
            return site;
        }

        return mergeAiSiteConfig(site, override);
    });

    const builtinNames = new Set(builtinSites.map(site => normalizeSiteName(site.name)));
    const customSites = configuredSites.filter(site => !builtinNames.has(normalizeSiteName(site.name)));

    return [...mergedBuiltinSites, ...customSites];
}

export function getPlatformIdByAddress(address: string): BuiltinPlatformId | null {
    const normalizedAddress = address.toLowerCase();
    const matched = BUILTIN_PLATFORMS.find(platform =>
        platform.addressIncludes.some(fragment => normalizedAddress.includes(fragment))
    );
    return matched?.id ?? null;
}

export function getDefaultBridgeTarget(): string {
    return BUILTIN_PLATFORMS[0].defaultSite.address;
}

export function getDefaultSelectors(): Record<BuiltinPlatformId, SiteSelectors> {
    return BUILTIN_PLATFORMS.reduce((acc, platform) => {
        acc[platform.id] = platform.selectors;
        return acc;
    }, {} as Record<BuiltinPlatformId, SiteSelectors>);
}

function normalizeSiteName(name: string | undefined): string {
    return String(name ?? '').trim().toLowerCase();
}

function mergeAiSiteConfig(base: AISiteConfig, override: AISiteConfig): AISiteConfig {
    return {
        ...base,
        ...override,
        selectors: {
            ...(base.selectors ?? {}),
            ...(override.selectors ?? {})
        }
    };
}
