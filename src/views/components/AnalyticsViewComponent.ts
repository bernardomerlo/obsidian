import { setIcon } from 'obsidian';
import type GanttPlugin from '../../main';
import { AnalyticsService } from '../../services/AnalyticsService';
import { Task } from '../../types';
import { getStatusColor } from '../../utils/domUtils';
import { TaskModal } from './TaskModal';

export class AnalyticsViewComponent {
	plugin: GanttPlugin;
	containerEl: HTMLElement;
	tasks: Task[] = [];

	constructor(plugin: GanttPlugin, containerEl: HTMLElement, tasks: Task[]) {
		this.plugin = plugin;
		this.containerEl = containerEl;
		this.tasks = tasks;
	}

	render(): void {
		this.containerEl.empty();
		this.containerEl.addClass('gantt-analytics-container');

		const stats = AnalyticsService.calculateAnalytics(this.tasks);

		// Metric Cards Row
		const kpiRow = this.containerEl.createDiv({ cls: 'gantt-kpi-row' });

		this.renderKpiCard(kpiRow, 'Total Tasks', `${stats.totalTasks}`, 'list-checks', 'var(--text-normal)');
		this.renderKpiCard(kpiRow, 'Completed', `${stats.completedTasks}`, 'check-circle-2', '#22c55e');
		this.renderKpiCard(kpiRow, 'In Progress', `${stats.inProgressTasks}`, 'clock', '#3b82f6');
		this.renderKpiCard(kpiRow, 'Avg Lead Time', `${stats.avgLeadTimeDays}d`, 'hourglass', '#a855f7');
		this.renderKpiCard(kpiRow, 'Total Reworks', `${stats.totalReworkCount}`, 'alert-triangle', '#f97316');
		this.renderKpiCard(kpiRow, 'Rework Rate', `${stats.reworkRatePercent}%`, 'activity', stats.reworkRatePercent > 25 ? '#ef4444' : '#eab308');

		// Two Column Layout
		const twoCol = this.containerEl.createDiv({ cls: 'gantt-analytics-grid' });

		// Left: Stage Duration Breakdown
		const leftCol = twoCol.createDiv({ cls: 'gantt-analytics-card' });
		leftCol.createEl('h3', { text: '⏱ Average Time in Each Status (Cycle Time)' });

		if (stats.stageStats.length === 0) {
			leftCol.createDiv({ cls: 'gantt-text-muted', text: 'No stage transitions recorded.' });
		} else {
			const maxDays = Math.max(...stats.stageStats.map((s) => s.avgDays), 1);
			const stageList = leftCol.createDiv({ cls: 'gantt-stage-stats-list' });

			for (const stage of stats.stageStats) {
				const row = stageList.createDiv({ cls: 'gantt-stage-stat-row' });
				
				const label = row.createDiv({ cls: 'gantt-stage-stat-label' });
				const dot = label.createSpan({ cls: 'gantt-stage-dot' });
				dot.style.backgroundColor = stage.color;
				label.createSpan({ text: stage.status });

				const barWrap = row.createDiv({ cls: 'gantt-stage-bar-wrap' });
				const bar = barWrap.createDiv({ cls: 'gantt-stage-bar-fill' });
				const pct = (stage.avgDays / maxDays) * 100;
				bar.style.width = `${Math.max(8, pct)}%`;
				bar.style.backgroundColor = stage.color;

				const val = row.createDiv({ cls: 'gantt-stage-stat-val', text: `${stage.avgDays} days avg (${stage.totalDays}d total)` });
			}
		}

		// Right: Rework & Bottleneck Watchlist
		const rightCol = twoCol.createDiv({ cls: 'gantt-analytics-card' });
		rightCol.createEl('h3', { text: '⚡ Rework & Bottleneck Watchlist' });

		if (stats.reworkTasks.length === 0) {
			rightCol.createDiv({ cls: 'gantt-text-muted', text: 'No status regressions detected! Flow is smooth.' });
		} else {
			const reworkList = rightCol.createDiv({ cls: 'gantt-rework-list' });
			for (const item of stats.reworkTasks) {
				const row = reworkList.createDiv({ cls: 'gantt-rework-item' });
				
				const titleLink = row.createEl('a', {
					cls: 'gantt-rework-title',
					text: item.task.title,
				});
				titleLink.onclick = () => new TaskModal(this.plugin.app, this.plugin, item.task).open();

				row.createSpan({
					cls: 'gantt-rework-count-badge',
					text: `${item.reworkCount} reworks`,
				});
			}
		}

		// Full Width: Activity Transition Stream
		const fullCard = this.containerEl.createDiv({ cls: 'gantt-analytics-card gantt-full-card' });
		fullCard.createEl('h3', { text: '📜 Recent Status Transition Activity' });

		if (stats.recentTransitions.length === 0) {
			fullCard.createDiv({ cls: 'gantt-text-muted', text: 'No transitions found in # History.' });
		} else {
			const stream = fullCard.createDiv({ cls: 'gantt-activity-stream' });
			for (const tr of stats.recentTransitions) {
				const item = stream.createDiv({ cls: 'gantt-activity-item' });
				item.createSpan({ cls: 'gantt-activity-date', text: tr.formattedDate });

				const desc = item.createDiv({ cls: 'gantt-activity-desc' });
				const taskLink = desc.createEl('span', { cls: 'gantt-activity-task', text: tr.taskTitle });
				
				if (tr.fromStatus) {
					desc.createSpan({ text: ' moved from ' });
					const fromChip = desc.createSpan({ cls: 'gantt-flow-chip', text: tr.fromStatus });
					fromChip.style.backgroundColor = getStatusColor(tr.fromStatus, this.plugin.settings.statuses);
					desc.createSpan({ text: ' → ' });
				} else {
					desc.createSpan({ text: ' set to ' });
				}

				const toChip = desc.createSpan({ cls: 'gantt-flow-chip', text: tr.toStatus });
				toChip.style.backgroundColor = getStatusColor(tr.toStatus, this.plugin.settings.statuses);
			}
		}
	}

	private renderKpiCard(container: HTMLElement, label: string, value: string, iconName: string, color: string): void {
		const card = container.createDiv({ cls: 'gantt-kpi-card' });
		
		const iconEl = card.createDiv({ cls: 'gantt-kpi-icon' });
		iconEl.style.color = color;
		setIcon(iconEl, iconName);

		const dataWrap = card.createDiv({ cls: 'gantt-kpi-data' });
		dataWrap.createDiv({ cls: 'gantt-kpi-val', text: value });
		dataWrap.createDiv({ cls: 'gantt-kpi-label', text: label });
	}
}
