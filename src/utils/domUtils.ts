import { StatusConfig } from '../types';

export const DEFAULT_STATUS_COLORS: Record<string, string> = {
	todo: '#64748b', // Slate Grey
	backlog: '#94a3b8',
	dev: '#3b82f6', // Blue
	'in-progress': '#3b82f6',
	'in progress': '#3b82f6',
	hom: '#eab308', // Amber / Yellow for Staging/Homologation
	homolog: '#eab308',
	staging: '#eab308',
	review: '#a855f7', // Purple
	qa: '#f97316', // Orange
	test: '#f97316',
	blocked: '#ef4444', // Red
	done: '#22c55e', // Green
	completed: '#22c55e',
	closed: '#16a34a',
	concluido: '#22c55e',
	concluído: '#22c55e',
	cancelled: '#71717a',
};

export function normalizeStatus(status: string): string {
	const s = (status || '').trim().toLowerCase().replace(/[-_\s]/g, '');
	if (['hom', 'homolog', 'homologacao', 'homologacao', 'staging', 'qa', 'review', 'teste', 'test'].includes(s)) {
		return 'hom';
	}
	if (['dev', 'development', 'desenvolvimento', 'emdesenvolvimento', 'inprogress', 'wip', 'emandamento'].includes(s)) {
		return 'dev';
	}
	if (['todo', 'backlog', 'afazer', 'aberto', 'open'].includes(s)) {
		return 'todo';
	}
	if (['done', 'concluido', 'concluido', 'finalizado', 'completed', 'closed', 'pronto'].includes(s)) {
		return 'done';
	}
	return (status || '').trim().toLowerCase();
}

export function getStatusColor(statusName: string, customStatuses: StatusConfig[] = []): string {
	const raw = (statusName || '').trim().toLowerCase();
	const normalized = normalizeStatus(raw);
	
	// Check custom configured statuses first
	const custom = customStatuses.find(
		(s) => s.id.toLowerCase() === raw || s.name.toLowerCase() === raw || normalizeStatus(s.id) === normalized
	);
	if (custom && custom.color) {
		return custom.color;
	}

	// Check default map
	const defaultRaw = DEFAULT_STATUS_COLORS[raw];
	if (defaultRaw) return defaultRaw;
	const defaultNorm = DEFAULT_STATUS_COLORS[normalized];
	if (defaultNorm) return defaultNorm;

	// Generate deterministic pleasant HSL color based on string hash
	let hash = 0;
	for (let i = 0; i < raw.length; i++) {
		hash = (hash << 5) - hash + raw.charCodeAt(i);
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
