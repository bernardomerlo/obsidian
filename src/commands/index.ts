import { Editor, MarkdownView, Notice, TFile } from 'obsidian';
import type GanttPlugin from '../main';
import { StatusPickerModal } from '../views/components/StatusPickerModal';
import { TaskModal } from '../views/components/TaskModal';
import { GANTT_VIEW_TYPE, GanttView } from '../views/GanttView';

export function registerCommands(plugin: GanttPlugin): void {
	// Command: Open Gantt View
	plugin.addCommand({
		id: 'open-gantt-view',
		name: 'Open Task Gantt view',
		callback: async () => {
			await activateGanttView(plugin);
		},
	});

	// Command: Create New Task Note
	plugin.addCommand({
		id: 'create-task-note',
		name: 'Create new task note',
		callback: () => {
			new TaskModal(plugin.app, plugin).open();
		},
	});

	// Command: Update Status of Current Note (Logs to # History)
	plugin.addCommand({
		id: 'update-current-note-status',
		name: 'Update status of active note',
		checkCallback: (checking: boolean) => {
			const activeFile = plugin.app.workspace.getActiveFile();
			if (!activeFile) return false;

			const task = plugin.taskManager.getTaskByPath(activeFile.path);
			if (checking) return true;

			if (task) {
				new StatusPickerModal(plugin.app, plugin, task).open();
			} else {
				new Notice('Active file is not recognized as a task note.');
			}
			return true;
		},
	});

	// Command: Refresh Task Data
	plugin.addCommand({
		id: 'refresh-task-data',
		name: 'Refresh task data',
		callback: async () => {
			await plugin.taskManager.refreshAllTasks();
			new Notice('Task data refreshed');
		},
	});
}

export async function activateGanttView(plugin: GanttPlugin): Promise<void> {
	const { workspace } = plugin.app;
	let leaf = workspace.getLeavesOfType(GANTT_VIEW_TYPE)[0];

	if (!leaf) {
		const newLeaf = workspace.getLeaf('tab');
		await newLeaf.setViewState({ type: GANTT_VIEW_TYPE, active: true });
		leaf = newLeaf;
	}

	workspace.revealLeaf(leaf);
}
