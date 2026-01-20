/**
 * Stellar Focus - Blocked Page Logic
 * Shows an encouraging message and the blocked URL
 */

import { config } from '../config';

// Encouraging messages with their submessages
const messages = [
  {
    main: 'Your focus session is active.',
    sub: 'This site will be here when you\'re done.'
  },
  {
    main: 'Stay in the zone.',
    sub: 'You\'ve got this.'
  },
  {
    main: 'Deep work requires deep focus.',
    sub: 'Keep going, you\'re doing great.'
  },
  {
    main: 'The stars align for those who stay focused.',
    sub: 'Your future self will thank you.'
  },
  {
    main: 'One task at a time.',
    sub: 'Distractions can wait.'
  },
  {
    main: 'Focus is a superpower.',
    sub: 'And you\'re using it right now.'
  }
];

// Get random message
function getRandomMessage() {
  const index = Math.floor(Math.random() * messages.length);
  return messages[index];
}

// Parse URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    url: params.get('url') || '',
    domain: params.get('domain') || ''
  };
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  const messageEl = document.getElementById('message');
  const submessageEl = document.getElementById('submessage');
  const blockedUrlEl = document.getElementById('blockedUrl');
  const returnBtn = document.getElementById('returnBtn') as HTMLAnchorElement;

  // Set return button URL from config
  if (returnBtn) {
    returnBtn.href = `${config.appUrl}/focus`;
  }

  // Set random message
  const msg = getRandomMessage();
  if (messageEl) messageEl.textContent = msg.main;
  if (submessageEl) submessageEl.textContent = msg.sub;

  // Show blocked domain
  const { domain } = getUrlParams();
  if (blockedUrlEl && domain) {
    blockedUrlEl.textContent = domain;
  }

  // Add keyboard shortcut to go back
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.history.back();
    }
  });
});
