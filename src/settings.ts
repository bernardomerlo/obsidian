import { App, PluginSettingTab, Setting } from 'obsidian';
import type GanttPlugin from './main';
import { GanttSettings } from './types';

export const DEFAULT_SETTINGS: GanttSettings = {
	taskFolder: '',
	dateFormat: 'DD-MM-YYYY',
	useWikilinksInHistory: true,
	defaultView: 'gantt',
	defaultScale: 'day',
	showHistorySegmentsByDefault: true,
	groupByFolder: true,
	clickAction: 'open-note',
	statuses: [
		{ id: 'todo', name: 'Todo', color: '#64748b', isDone: false, order: 1 },
		{ id: 'dev', name: 'Dev', color: '#3b82f6', isDone: false, order: 2 },
		{ id: 'hom', name: 'Hom', color: '#eab308', isDone: false, order: 3 },
		{ id: 'done', name: 'Done', color: '#22c55e', isDone: true, order: 4 },
	],
	kanbanColumns: ['todo', 'dev', 'hom', 'done'],
	autoSetDatesOnStatusChange: true,
	includeSubfolders: true,
	workdaysOnly: false,
	filterTags: [],
};

export class GanttSettingTab extends PluginSettingTab {
	plugin: GanttPlugin;

	constructor(app: App, plugin: GanttPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Task folder')
			.setDesc('Only scan tasks within this folder. Leave empty to scan the entire vault.')
			.addText((text) =>
				text
					.setPlaceholder('E.g., projects or tasks')
					.setValue(this.plugin.settings.taskFolder)
					.onChange(async (value) => {
						this.plugin.settings.taskFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Group tasks by folder (projects)')
			.setDesc('Create horizontal subdivisions for each subfolder inside the search folder.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.groupByFolder)
					.onChange(async (value) => {
						this.plugin.settings.groupByFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Task click action')
			.setDesc('What happens when clicking a task bar or row in the panel.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('open-note', 'Open note in editor')
					.addOption('edit-modal', 'Open edit modal')
					.setValue(this.plugin.settings.clickAction || 'open-note')
					.onChange(async (value: string) => {
						this.plugin.settings.clickAction = value as 'open-note' | 'edit-modal';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('History date format')
			.setDesc('Format used when recording new status entries in # history.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('DD-MM-YYYY', 'Dd-mm-yyyy (e.g. 01-08-2026)')
					.addOption('YYYY-MM-DD', 'Yyyy-mm-dd (e.g. 2026-08-01)')
					.addOption('MM-DD-YYYY', 'Mm-dd-yyyy (e.g. 08-01-2026)')
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value: string) => {
						this.plugin.settings.dateFormat = value as 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'MM-DD-YYYY';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Use daily note wikilinks in history')
			.setDesc('Wrap dates in [[...]] in # history (e.g., - [[01-08-2026]] - dev).')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useWikilinksInHistory)
					.onChange(async (value) => {
						this.plugin.settings.useWikilinksInHistory = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Default view')
			.setDesc('Initial view mode when opening the life manager workspace.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('gantt', 'Gantt chart')
					.addOption('table', 'Table view')
					.addOption('kanban', 'Kanban board')
					.addOption('calendar', 'Calendar view')
					.addOption('analytics', 'History & flow analytics')
					.setValue(this.plugin.settings.defaultView)
					.onChange(async (value: string) => {
						this.plugin.settings.defaultView = value as GanttSettings['defaultView'];
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Default gantt scale')
			.setDesc('Default zoom scale on the gantt timeline.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('day', 'Day')
					.addOption('week', 'Week')
					.addOption('month', 'Month')
					.addOption('quarter', 'Quarter')
					.addOption('year', 'Year')
					.setValue(this.plugin.settings.defaultScale)
					.onChange(async (value: string) => {
						this.plugin.settings.defaultScale = value as GanttSettings['defaultScale'];
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Show history segments on gantt by default')
			.setDesc('Render multi-colored bars representing each status interval from # history.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHistorySegmentsByDefault)
					.onChange(async (value) => {
						this.plugin.settings.showHistorySegmentsByDefault = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Auto-set start date')
			.setDesc('Automatically set start date when moving a task out of initial status if empty.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSetDatesOnStatusChange)
					.onChange(async (value) => {
						this.plugin.settings.autoSetDatesOnStatusChange = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName('Configured statuses').setHeading();
		const statusListEl = containerEl.createDiv({ cls: 'gantt-settings-status-list' });
		this.renderStatusSettings(statusListEl);
	}

	private renderStatusSettings(container: HTMLElement): void {
		container.empty();
		this.plugin.settings.statuses.forEach((status, idx) => {
			new Setting(container)
				.setName(status.name)
				.addText((text) =>
					text
						.setPlaceholder('Status ID/name')
						.setValue(status.name)
						.onChange(async (val) => {
							status.name = val;
							status.id = val.toLowerCase().replace(/\s+/g, '-');
							await this.plugin.saveSettings();
						})
				)
				.addColorPicker((color) =>
					color
						.setValue(status.color)
						.onChange(async (val) => {
							status.color = val;
							await this.plugin.saveSettings();
						})
				)
				.addToggle((toggle) =>
					toggle
						.setTooltip('Marks task as done/completed')
						.setValue(!!status.isDone)
						.onChange(async (val) => {
							status.isDone = val;
							await this.plugin.saveSettings();
						})
				)
				.addExtraButton((btn) =>
					btn
						.setIcon('trash')
						.setTooltip('Delete status')
						.onClick(async () => {
							this.plugin.settings.statuses.splice(idx, 1);
							await this.plugin.saveSettings();
							this.renderStatusSettings(container);
						})
				);
		});

		new Setting(container)
			.addButton((btn) =>
				btn
					.setButtonText('+ add status')
					.onClick(async () => {
						this.plugin.settings.statuses.push({
							id: `status-${Date.now()}`,
							name: 'New Status',
							color: '#3b82f6',
							isDone: false,
							order: this.plugin.settings.statuses.length + 1,
						});
						await this.plugin.saveSettings();
						this.renderStatusSettings(container);
					})
			);
	}
}
