import { Plugin } from 'obsidian';
import { activateGanttView, registerCommands } from './commands';
import { DEFAULT_SETTINGS, GanttSettingTab } from './settings';
import { TaskManager } from './services/TaskManager';
import { GanttSettings } from './types';
import { CodeblockProcessor } from './views/CodeblockProcessor';
import { GANTT_VIEW_TYPE, GanttView } from './views/GanttView';

export default class GanttPlugin extends Plugin {
	settings!: GanttSettings;
	taskManager!: TaskManager;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize TaskManager service
		this.taskManager = new TaskManager(this);
		await this.taskManager.initialize();

		// Register Gantt Custom View Leaf
		this.registerView(GANTT_VIEW_TYPE, (leaf) => new GanttView(leaf, this));

		// Register Markdown Code Block processor for ```gantt
		CodeblockProcessor.register(this);

		// Register Commands
		registerCommands(this);

		// Ribbon Icon to quickly open Task Gantt
		this.addRibbonIcon('bar-chart-2', 'Task Gantt', async () => {
			await activateGanttView(this);
		});

		// Settings Tab
		this.addSettingTab(new GanttSettingTab(this.app, this));
	}

	onunload(): void {
		if (this.taskManager) {
			this.taskManager.destroy();
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<GanttSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		if (this.taskManager) {
			await this.taskManager.refreshAllTasks();
		}
	}
}
