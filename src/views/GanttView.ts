import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import type GanttPlugin from '../main';
import { FilterOptions, GanttScale, ViewType } from '../types';
import { AnalyticsViewComponent } from './components/AnalyticsViewComponent';
import { CalendarViewComponent } from './components/CalendarViewComponent';
import { GanttChartComponent } from './components/GanttChartComponent';
import { KanbanViewComponent } from './components/KanbanViewComponent';
import { TableViewComponent } from './components/TableViewComponent';
import { TaskModal } from './components/TaskModal';

export const GANTT_VIEW_TYPE = 'life-manager-view';

export class GanttView extends ItemView {
	plugin: GanttPlugin;
	activeViewType: ViewType = 'gantt';
	activeScale: GanttScale = 'day';
	showSegments = true;
	filters: FilterOptions = {
		searchQuery: '',
		selectedStatuses: [],
		selectedTags: [],
		folder: '',
		dateFrom: null,
		dateTo: null,
		showDone: true,
	};

	private unsubscribeTaskEvents?: () => void;
	private mainContentEl: HTMLElement | null = null;
	private toolbarEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: GanttPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.activeViewType = plugin.settings.defaultView || 'gantt';
		this.activeScale = plugin.settings.defaultScale || 'day';
		this.showSegments = plugin.settings.showHistorySegmentsByDefault;
	}

	getViewType(): string {
		return GANTT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Life manager';
	}

	getIcon(): string {
		return 'layout-dashboard';
	}

	async onOpen(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('gantt-plugin-view');

		// Header Toolbar
		this.toolbarEl = containerEl.createDiv({ cls: 'gantt-view-toolbar' });
		
		// Main Display Area
		this.mainContentEl = containerEl.createDiv({ cls: 'gantt-view-content' });

		// Subscribe to task updates
		this.unsubscribeTaskEvents = this.plugin.taskManager.subscribe(() => {
			this.renderActiveView();
		});

		this.renderToolbar();
		this.renderActiveView();
	}

	async onClose(): Promise<void> {
		if (this.unsubscribeTaskEvents) {
			this.unsubscribeTaskEvents();
		}
	}

	private renderToolbar(): void {
		if (!this.toolbarEl) return;
		this.toolbarEl.empty();

		const leftGroup = this.toolbarEl.createDiv({ cls: 'gantt-toolbar-group' });

		// View Mode Switcher
		const views: Array<{ type: ViewType; label: string; icon: string }> = [
			{ type: 'gantt', label: 'Gantt', icon: 'bar-chart-2' },
			{ type: 'table', label: 'Table', icon: 'table' },
			{ type: 'kanban', label: 'Board', icon: 'layout-grid' },
			{ type: 'calendar', label: 'Calendar', icon: 'calendar' },
			{ type: 'analytics', label: 'Flow & Analytics', icon: 'activity' },
		];

		const viewSwitch = leftGroup.createDiv({ cls: 'gantt-segmented-switch' });
		for (const v of views) {
			const btn = viewSwitch.createEl('button', {
				cls: `gantt-switch-btn ${this.activeViewType === v.type ? 'is-active' : ''}`,
			});
			const iconSpan = btn.createSpan();
			setIcon(iconSpan, v.icon);
			btn.createSpan({ text: v.label });

			btn.onclick = () => {
				this.activeViewType = v.type;
				this.renderToolbar();
				this.renderActiveView();
			};
		}

		// Scale Switcher (Only visible in Gantt mode)
		if (this.activeViewType === 'gantt') {
			const scaleGroup = this.toolbarEl.createDiv({ cls: 'gantt-toolbar-group' });
			const scales: GanttScale[] = ['day', 'week', 'month', 'quarter', 'year'];
			const scaleSwitch = scaleGroup.createDiv({ cls: 'gantt-segmented-switch' });
			
			for (const s of scales) {
				const btn = scaleSwitch.createEl('button', {
					cls: `gantt-switch-btn ${this.activeScale === s ? 'is-active' : ''}`,
					text: s.charAt(0).toUpperCase() + s.slice(1),
				});
				btn.onclick = () => {
					this.activeScale = s;
					this.renderToolbar();
					this.renderActiveView();
				};
			}

			// Segmented Bar Toggle
			const segToggle = scaleGroup.createEl('button', {
				cls: `gantt-toggle-btn ${this.showSegments ? 'is-active' : ''}`,
				title: 'Toggle status history segments on bars',
			});
			const segIcon = segToggle.createSpan();
			setIcon(segIcon, 'layers');
			segToggle.createSpan({ text: 'History Segments' });
			segToggle.onclick = () => {
				this.showSegments = !this.showSegments;
				this.renderToolbar();
				this.renderActiveView();
			};
		}

		// Right Group: Search & Actions
		const rightGroup = this.toolbarEl.createDiv({ cls: 'gantt-toolbar-group gantt-right-group' });

		// Search input
		const searchWrap = rightGroup.createDiv({ cls: 'gantt-search-wrapper' });
		const searchIcon = searchWrap.createSpan({ cls: 'gantt-search-icon' });
		setIcon(searchIcon, 'search');
		const searchInput = searchWrap.createEl('input', {
			cls: 'gantt-search-input',
			type: 'text',
			placeholder: 'Search tasks...',
		});
		searchInput.value = this.filters.searchQuery;
		searchInput.oninput = () => {
			this.filters.searchQuery = searchInput.value;
			this.renderActiveView();
		};

		// Filter by Status dropdown
		const statusFilter = rightGroup.createEl('select', { cls: 'gantt-status-filter-select' });
		statusFilter.createEl('option', { value: '', text: 'All statuses' });
		for (const st of this.plugin.settings.statuses) {
			statusFilter.createEl('option', { value: st.id, text: st.name });
		}
		statusFilter.onchange = () => {
			if (statusFilter.value) {
				this.filters.selectedStatuses = [statusFilter.value];
			} else {
				this.filters.selectedStatuses = [];
			}
			this.renderActiveView();
		};

		// Refresh Button
		const refreshBtn = rightGroup.createEl('button', {
			cls: 'gantt-action-icon-btn',
			title: 'Refresh tasks',
		});
		setIcon(refreshBtn, 'rotate-cw');
		refreshBtn.onclick = () => {
			void this.plugin.taskManager.refreshAllTasks();
		};

		// New Task Button
		const newBtn = rightGroup.createEl('button', {
			cls: 'mod-cta gantt-new-task-btn',
		});
		const plusIcon = newBtn.createSpan();
		setIcon(plusIcon, 'plus');
		newBtn.createSpan({ text: 'New Task' });
		newBtn.onclick = () => {
			new TaskModal(this.plugin.app, this.plugin).open();
		};
	}

	private renderActiveView(): void {
		if (!this.mainContentEl) return;
		this.mainContentEl.empty();

		const filteredTasks = this.plugin.taskManager.getFilteredTasks(this.filters);

		switch (this.activeViewType) {
			case 'gantt': {
				const gantt = new GanttChartComponent(
					this.plugin,
					this.mainContentEl,
					filteredTasks,
					this.activeScale,
					this.showSegments
				);
				gantt.render();
				break;
			}
			case 'table': {
				const table = new TableViewComponent(this.plugin, this.mainContentEl, filteredTasks);
				table.render();
				break;
			}
			case 'kanban': {
				const kanban = new KanbanViewComponent(this.plugin, this.mainContentEl, filteredTasks);
				kanban.render();
				break;
			}
			case 'calendar': {
				const cal = new CalendarViewComponent(this.plugin, this.mainContentEl, filteredTasks);
				cal.render();
				break;
			}
			case 'analytics': {
				const analytics = new AnalyticsViewComponent(this.plugin, this.mainContentEl, filteredTasks);
				analytics.render();
				break;
			}
		}
	}
}
