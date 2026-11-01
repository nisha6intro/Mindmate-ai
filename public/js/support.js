/** Crisis support modal, backed by the safety API with a local fallback. */

import { api } from './api.js';
import { CRISIS_LINKS } from './constants.js';
import { closeModal, escapeHtml, icon, openModal, refreshIcons } from './ui.js';

let cached = null;

function fallbackResources() {
  return {
    disclaimer:
      'MindMate AI is a supportive wellness companion, not a licensed therapist or a substitute for professional care.',
    note: 'If you are in immediate danger, call your local emergency number. MindMate is not a crisis service and cannot contact emergency help for you.',
    resources: CRISIS_LINKS.map((link) => ({ name: link.label, contact: '', url: link.href.startsWith('http') ? link.href : null })),
  };
}

export async function openSupportModal() {
  const data = cached || (await api.safety().catch(() => null)) || fallbackResources();
  cached = data;

  const resources = Array.isArray(data.resources) && data.resources.length ? data.resources : fallbackResources().resources;
  const list = resources
    .map((resource) => {
      const title = escapeHtml(resource.name || 'Support service');
      const region = resource.region ? `<span> · ${escapeHtml(resource.region)}</span>` : '';
      const contact = resource.contact ? escapeHtml(resource.contact) : '';
      const link = resource.url
        ? ` <a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">Open <i data-lucide="external-link"></i></a>`
        : '';
      return `<li><strong>${title}${region}</strong><span>${contact}${link}</span></li>`;
    })
    .join('');

  openModal({
    title: 'You deserve immediate support',
    description: 'If you are in danger or thinking about harming yourself, please reach a human right now.',
    iconName: 'life-buoy',
    tone: 'danger',
    wide: true,
    body: `
      <p>You do not have to manage this alone, and asking for help is not a failure. These services are free and confidential where listed.</p>
      <ul class="modal-safety-list">${list}</ul>
      <div class="modal-note is-warning">
        <strong>If you are in immediate danger:</strong> call your local emergency number (112, 911, or 999) or go to the nearest emergency department. If you can, ask someone you trust to stay with you.
      </div>
    `,
    footer: `
      <a class="btn btn-ghost" href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">${icon('globe')} Find a helpline</a>
      <button class="btn btn-primary" type="button" data-modal-close>Close</button>
    `,
  });

  refreshIcons();
}
