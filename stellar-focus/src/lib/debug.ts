import browser from 'webextension-polyfill';

let debugEnabled: boolean | null = null;

export async function initDebugMode(): Promise<void> {
	const result = await browser.storage.local.get('stellar_debug_mode');
	debugEnabled = result.stellar_debug_mode === true;
}

export function isDebugMode(): boolean {
	return debugEnabled === true;
}

export function setDebugModeCache(enabled: boolean): void {
	debugEnabled = enabled;
}

export function debugLog(...args: unknown[]): void {
	if (debugEnabled) console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
	if (debugEnabled) console.warn(...args);
}

export function debugError(...args: unknown[]): void {
	if (debugEnabled) console.error(...args);
}
