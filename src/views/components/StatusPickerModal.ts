import { App, FuzzySuggestModal } from 'obsidian';
import type GanttPlugin from '../../main';
import { StatusConfig, Task } from '../../types';

export class StatusPickerModal extends FuzzySuggestModal<StatusConfig> {
	plugin: GanttPlugin;
	task: Task;
	onChoose: (status: StatusConfig) => void;

	constructor(app: App, plugin: GanttPlugin, task: Task, onChoose?: (status: StatusConfig) => void) {
		super(app);
		this.plugin = plugin;
		this.task = task;
		this.onChoose = onChoose || ((status) => {
			void this.plugin.taskManager.updateTaskStatus(this.task, status.id);
		});
		this.setPlaceholder(`Select new status for "${task.title}" (current: ${task.status})`);
	}

	getItems(): StatusConfig[] {
		return this.plugin.settings.statuses;
	}

	getItemText(item: StatusConfig): string {
		return item.name;
	}

	onChooseItem(item: StatusConfig, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item);
	}
}
