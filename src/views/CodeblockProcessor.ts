import { MarkdownPostProcessorContext, parseYaml } from 'obsidian';
import type GanttPlugin from '../main';
import { CodeblockConfig, GanttScale, ViewType } from '../types';
import { AnalyticsViewComponent } from './components/AnalyticsViewComponent';
import { CalendarViewComponent } from './components/CalendarViewComponent';
import { GanttChartComponent } from './components/GanttChartComponent';
import { KanbanViewComponent } from './components/KanbanViewComponent';
import { TableViewComponent } from './components/TableViewComponent';

export class CodeblockProcessor {
	static register(plugin: GanttPlugin): void {
		const handler = async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			await this.process(plugin, source, el, ctx);
		};

		plugin.registerMarkdownCodeBlockProcessor('life-manager', handler);
		plugin.registerMarkdownCodeBlockProcessor('manager', handler);
		plugin.registerMarkdownCodeBlockProcessor('gantt', handler);
	}

	private static async process(
		plugin: GanttPlugin,
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	): Promise<void> {
		el.empty();
		el.addClass('gantt-codeblock-container');

		let config: CodeblockConfig = {};
		try {
			if (source.trim()) {
				config = (parseYaml(source) as CodeblockConfig) || {};
			}
		} catch (e) {
			const errText = e instanceof Error ? e.message : String(e);
			el.createDiv({ cls: 'gantt-error-msg', text: `Invalid YAML in gantt codeblock: ${errText}` });
			return;
		}

		if (config.title) {
			el.createEl('h3', { cls: 'gantt-codeblock-title', text: config.title });
		}

		if (config.height) {
			el.style.height = config.height;
		}

		// Filter tasks according to codeblock parameters
		const allTasks = plugin.taskManager.getAllTasks();
		const filteredTasks = allTasks.filter((task) => {
			if (config.folder && !task.file.path.startsWith(config.folder)) {
				return false;
			}
			if (config.tag && !task.tags.includes(config.tag.replace(/^#/, ''))) {
				return false;
			}
			if (config.tags && !config.tags.some((t) => task.tags.includes(t.replace(/^#/, '')))) {
				return false;
			}
			if (config.status && task.status.toLowerCase() !== config.status.toLowerCase()) {
				return false;
			}
			if (
				config.statuses &&
				!config.statuses.some((s) => s.toLowerCase() === task.status.toLowerCase())
			) {
				return false;
			}
			return true;
		});

		const viewType: ViewType = config.view || 'gantt';
		const scale: GanttScale = config.scale || 'day';
		const showSegments = config.showSegments !== undefined ? config.showSegments : true;

		const contentWrap = el.createDiv({ cls: 'gantt-codeblock-content' });

		switch (viewType) {
			case 'gantt': {
				const gantt = new GanttChartComponent(plugin, contentWrap, filteredTasks, scale, showSegments);
				gantt.render();
				break;
			}
			case 'table': {
				const table = new TableViewComponent(plugin, contentWrap, filteredTasks);
				table.render();
				break;
			}
			case 'kanban': {
				const kanban = new KanbanViewComponent(plugin, contentWrap, filteredTasks);
				kanban.render();
				break;
			}
			case 'calendar': {
				const cal = new CalendarViewComponent(plugin, contentWrap, filteredTasks);
				cal.render();
				break;
			}
			case 'analytics': {
				const analytics = new AnalyticsViewComponent(plugin, contentWrap, filteredTasks);
				analytics.render();
				break;
			}
		}
	}
}
