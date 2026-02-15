/**
 * Stellar Focus - Options Page Logic
 * Configures the extension to connect to a Stellar/Supabase instance.
 */

import browser from 'webextension-polyfill';
import { createClient } from '@supabase/supabase-js';
import { getConfig, setConfig } from '../config';

// DOM Elements
const form = document.getElementById('configForm') as HTMLFormElement;
const supabaseUrlInput = document.getElementById('supabaseUrl') as HTMLInputElement;
const supabaseAnonKeyInput = document.getElementById('supabaseAnonKey') as HTMLInputElement;
const appUrlInput = document.getElementById('appUrl') as HTMLInputElement;
const messageEl = document.getElementById('message') as HTMLElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;

// Settings elements
const adminCard = document.getElementById('adminCard') as HTMLElement;
const debugToggle = document.getElementById('debugToggle') as HTMLButtonElement;

// Privacy link
const privacyLink = document.getElementById('privacyLink') as HTMLAnchorElement;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Pre-fill existing values if config already exists
  const existing = await getConfig();
  if (existing) {
    supabaseUrlInput.value = existing.supabaseUrl;
    supabaseAnonKeyInput.value = existing.supabaseAnonKey;
    appUrlInput.value = existing.appUrl;
  }

  form.addEventListener('submit', handleSubmit);

  // Always show settings
  adminCard.classList.remove('hidden');

  // Load current debug mode state
  const result = await browser.storage.local.get('stellar_debug_mode');
  if (result.stellar_debug_mode === true) {
    debugToggle.classList.add('active');
    debugToggle.setAttribute('aria-checked', 'true');
  }

  // Privacy link
  if (privacyLink) {
    privacyLink.href = browser.runtime.getURL('privacy/privacy.html');
    privacyLink.target = '_blank';
  }

  debugToggle.addEventListener('click', async () => {
    const isActive = debugToggle.classList.toggle('active');
    debugToggle.setAttribute('aria-checked', String(isActive));
    await browser.storage.local.set({ stellar_debug_mode: isActive });
  });
});

async function handleSubmit(e: Event) {
  e.preventDefault();
  hideMessage();

  const supabaseUrl = supabaseUrlInput.value.trim();
  const supabaseAnonKey = supabaseAnonKeyInput.value.trim();
  const appUrl = appUrlInput.value.trim().replace(/\/$/, ''); // Remove trailing slash

  if (!supabaseUrl || !supabaseAnonKey || !appUrl) {
    showMessage('All fields are required', 'error');
    return;
  }

  // Validate URL formats
  try {
    new URL(supabaseUrl);
  } catch {
    showMessage('Invalid Supabase URL format', 'error');
    return;
  }

  try {
    new URL(appUrl);
  } catch {
    showMessage('Invalid App URL format', 'error');
    return;
  }

  setLoading(true);

  try {
    // Test Supabase connectivity
    const tempClient = createClient(supabaseUrl, supabaseAnonKey);
    const { error } = await tempClient.from('focus_sessions').select('id').limit(1);

    if (error) {
      // "Invalid API key" means bad credentials
      if (error.message?.includes('Invalid API key') || error.code === 'PGRST301') {
        showMessage('Invalid Supabase credentials. Check your URL and Anon Key.', 'error');
        setLoading(false);
        return;
      }
      // Other errors (like missing table) are OK — API is reachable
    }

    // Save config
    await setConfig({ supabaseUrl, supabaseAnonKey, appUrl });

    // Notify service worker to re-initialize
    try {
      await browser.runtime.sendMessage({ type: 'CONFIG_UPDATED' });
    } catch {
      // Service worker might not be running yet
    }

    showMessage('Configuration saved successfully. The extension is now connected.', 'success');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    showMessage(`Could not connect to Supabase: ${msg}`, 'error');
  }

  setLoading(false);
}

function showMessage(text: string, type: 'error' | 'success') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.classList.remove('hidden');
}

function hideMessage() {
  messageEl.classList.add('hidden');
}

function setLoading(loading: boolean) {
  const btnText = saveBtn.querySelector('.btn-text') as HTMLElement;
  const btnLoading = saveBtn.querySelector('.btn-loading') as HTMLElement;

  if (loading) {
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');
    saveBtn.disabled = true;
  } else {
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    saveBtn.disabled = false;
  }
}
