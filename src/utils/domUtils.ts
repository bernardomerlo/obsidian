import { StatusConfig } from '../types';

export const DEFAULT_STATUS_COLORS: Record<string, string> = {
	todo: '#64748b', // Slate
	backlog: '#94a3b8',
	dev: '#3b82f6', // Blue
	'in-progress': '#0ea5e9', // Sky
	'in progress': '#0ea5e9',
	hom: '#eab308', // Amber / Yellow for Staging/Homologation
	staging: '#eab308',
	review: '#a855f7', // Purple
	qa: '#f97316', // Orange
	test: '#f97316',
	blocked: '#ef4444', // Red
	done: '#22c55e', // Green
	completed: '#22c55e',
	closed: '#16a34a',
	cancelled: '#71717a',
};

export function getStatusColor(statusName: string, customStatuses: StatusConfig[] = []): string {
	const normalized = (statusName || '').trim().toLowerCase();
	
	// Check custom configured statuses first
	const custom = customStatuses.find(s => s.id.toLowerCase() === normalized || s.name.toLowerCase() === normalized);
	if (custom && custom.color) {
		return custom.color;
	}

	// Check default map
	if (DEFAULT_STATUS_COLORS[normalized]) {
		return DEFAULT_STATUS_COLORS[normalized]!;
	}

	// Generate deterministic pleasant HSL color based on string hash
	let hash = 0;
	for (let i = 0; i < normalized.length; i++) {
		hash = (hash << 5) - hash + normalized.charCodeAt(i);
		hash |= 0;
	}
	const hue = Math.abs(hash) % 360;
	return `hsl(${hue}, 65%, 48%)`;
}

export function getFolderColor(folderPath?: string, level: number = 0): string {
	return 'var(--text-muted)';
}

export function createStatusBadge(
	container: HTMLElement,
	status: string,
	customStatuses: StatusConfig[] = [],
	interactive = false
): HTMLElement {
	const color = getStatusColor(status, customStatuses);
	const badge = container.createDiv({
		cls: `gantt-status-badge ${interactive ? 'is-interactive' : ''}`,
		text: status || 'none',
	});
	badge.style.setProperty('--badge-color', color);
	badge.dataset.status = status;
	return badge;
}

export function createTagPill(container: HTMLElement, tag: string): HTMLElement {
	const cleanTag = tag.replace(/^#/, '');
	return container.createSpan({
		cls: 'gantt-tag-pill',
		text: `#${cleanTag}`,
	});
}

export function createProgressBar(container: HTMLElement, progress: number): HTMLElement {
	const bar = container.createDiv({ cls: 'gantt-mini-progress' });
	const fill = bar.createDiv({ cls: 'gantt-mini-progress-fill' });
	const clamped = Math.max(0, Math.min(100, Math.round(progress)));
	fill.style.width = `${clamped}%`;
	if (clamped >= 100) fill.addClass('is-done');
	return bar;
}

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}
