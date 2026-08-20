import { App, EventRef, normalizePath, Notice, TFile, TFolder } from 'obsidian';
import type GanttPlugin from '../main';
import { TaskParser } from '../parser/TaskParser';
import { FilterOptions, GanttSettings, Task } from '../types';
import { formatDate } from '../utils/dateUtils';

type TaskChangeListener = () => void;

export class TaskManager {
	app: App;
	plugin: GanttPlugin;
	private tasks: Map<string, Task> = new Map();
	private listeners: Set<TaskChangeListener> = new Set();
	private isInitialized = false;
	private eventRefs: EventRef[] = [];

	constructor(plugin: GanttPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
	}

	get settings(): GanttSettings {
		return this.plugin.settings;
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) return;
		await this.refreshAllTasks();

		// Register vault events
		const onModifyRef = this.app.vault.on('modify', async (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				await this.reloadFile(file);
			}
		});
		this.eventRefs.push(onModifyRef);

		const onDeleteRef = this.app.vault.on('delete', (file) => {
			if (file instanceof TFile && this.tasks.has(file.path)) {
				this.tasks.delete(file.path);
				this.notifyListeners();
			}
		});
		this.eventRefs.push(onDeleteRef);

		const onRenameRef = this.app.vault.on('rename', async (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'md') {
				this.tasks.delete(oldPath);
				await this.reloadFile(file);
			}
		});
		this.eventRefs.push(onRenameRef);

		const onCreateRef = this.app.vault.on('create', async (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				await this.reloadFile(file);
			}
		});
		this.eventRefs.push(onCreateRef);

		this.isInitialized = true;
	}

	destroy(): void {
		for (const ref of this.eventRefs) {
			this.app.vault.offref(ref);
		}
		this.eventRefs = [];
		this.listeners.clear();
		this.tasks.clear();
		this.isInitialized = false;
	}

	subscribe(listener: TaskChangeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notifyListeners(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (e) {
				console.error('Error notifying TaskManager listener', e);
			}
		}
	}

	async refreshAllTasks(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();
		const folderPrefix = this.settings.taskFolder ? normalizePath(this.settings.taskFolder) : '';

		const newTasks = new Map<string, Task>();

		for (const file of files) {
			if (folderPrefix && !file.path.startsWith(folderPrefix)) {
				continue;
			}

			try {
				const content = await this.app.vault.read(file);
				if (this.isTaskNote(file, content)) {
					const task = TaskParser.parse(file, content);
					newTasks.set(file.path, task);
				}
			} catch (err) {
				console.error(`Failed to read task note: ${file.path}`, err);
			}
		}

		this.linkParentChildTasks(newTasks);
		this.tasks = newTasks;
		this.notifyListeners();
	}

	async reloadFile(file: TFile): Promise<void> {
		const folderPrefix = this.settings.taskFolder ? normalizePath(this.settings.taskFolder) : '';
		if (folderPrefix && !file.path.startsWith(folderPrefix)) {
			if (this.tasks.has(file.path)) {
				this.tasks.delete(file.path);
				this.notifyListeners();
			}
			return;
		}

		try {
			const content = await this.app.vault.read(file);
			if (this.isTaskNote(file, content)) {
				const task = TaskParser.parse(file, content);
				this.tasks.set(file.path, task);
				this.linkParentChildTasks(this.tasks);
				this.notifyListeners();
			} else if (this.tasks.has(file.path)) {
				this.tasks.delete(file.path);
				this.linkParentChildTasks(this.tasks);
				this.notifyListeners();
			}
		} catch (err) {
			console.error(`Failed to reload task note: ${file.path}`, err);
		}
	}

	private linkParentChildTasks(tasksMap: Map<string, Task>): void {
		const allTasks = Array.from(tasksMap.values());
		// Reset parent links
		for (const t of allTasks) {
			t.parentBg = undefined;
		}

		// Link child tasks to parent BG
		for (const bgTask of allTasks) {
			if (bgTask.child && bgTask.child.length > 0) {
				for (const childRef of bgTask.child) {
					const target = TaskParser.findTaskByRef(allTasks, childRef);
					if (target && target !== bgTask) {
						target.parentBg = bgTask.title;
					}
				}
			}
		}
	}

	isTaskNote(file: TFile, content: string): boolean {
		const { frontmatter } = TaskParser.splitFrontmatter(content);
		if (
			frontmatter['status'] !== undefined ||
			frontmatter['start'] !== undefined ||
			frontmatter['end'] !== undefined ||
			frontmatter['startDate'] !== undefined ||
			frontmatter['endDate'] !== undefined ||
			frontmatter['assignee'] !== undefined ||
			frontmatter['child'] !== undefined ||
			frontmatter['children'] !== undefined ||
			frontmatter['-child'] !== undefined ||
			frontmatter['tipo'] !== undefined
		) {
			return true;
		}

		// Also check if content has # History
		return /^(#{1,6})\s+History\s*$/im.test(content);
	}

	getAllTasks(): Task[] {
		return TaskParser.orderTasksByBacklogHierarchy(Array.from(this.tasks.values()));
	}

	getTaskByPath(path: string): Task | undefined {
		return this.tasks.get(path);
	}

	getFilteredTasks(filters: Partial<FilterOptions>): Task[] {
		const tasks = this.getAllTasks();
		return tasks.filter((task) => {
			if (filters.searchQuery) {
				const q = filters.searchQuery.toLowerCase();
				const matches =
					task.title.toLowerCase().includes(q) ||
					task.status.toLowerCase().includes(q) ||
					task.tags.some((t) => t.toLowerCase().includes(q)) ||
					task.bodyContent.toLowerCase().includes(q);
				if (!matches) return false;
			}

			if (filters.selectedStatuses && filters.selectedStatuses.length > 0) {
				const match = filters.selectedStatuses.some(
					(s) => s.toLowerCase() === task.status.toLowerCase()
				);
				if (!match) return false;
			}

			if (filters.selectedTags && filters.selectedTags.length > 0) {
				const match = filters.selectedTags.some((t) => task.tags.includes(t));
				if (!match) return false;
			}

			if (filters.folder) {
				const norm = normalizePath(filters.folder);
				if (!task.file.path.startsWith(norm)) return false;
			}

			if (filters.showDone === false) {
				const st = task.status.toLowerCase();
				if (st === 'done' || st === 'completed' || st === 'closed') return false;
			}

			return true;
		});
	}

	async createTask(data: {
		title: string;
		tipo?: 'bg' | 'css' | 'pbi';
		taskId?: string;
		projeto?: string;
		folder?: string;
		startDate?: Date | null;
		endDate?: Date | null;
		status?: string;
		tags?: string[];
		priority?: string;
		body?: string;
		link?: string[];
		tarefa?: string[];
		child?: string[];
	}): Promise<TFile> {
		const folderPath = data.folder || this.settings.taskFolder || '';
		let targetFolder = this.app.vault.getRoot();

		if (folderPath) {
			const norm = normalizePath(folderPath);
			const folder = this.app.vault.getAbstractFileByPath(norm);
			if (folder instanceof TFolder) {
				targetFolder = folder;
			} else {
				await this.app.vault.createFolder(norm);
				const created = this.app.vault.getAbstractFileByPath(norm);
				if (created instanceof TFolder) targetFolder = created;
			}
		}

		let finalTitle = data.title.trim();
		if (data.tipo === 'bg' && !finalTitle.startsWith('BG-') && !finalTitle.startsWith('BG')) {
			finalTitle = `BG-${finalTitle}`;
		} else if (data.tipo === 'css' && !finalTitle.startsWith('CSS-')) {
			finalTitle = `CSS-${finalTitle}`;
		}

		let fileName = `${finalTitle.replace(/[\\/:*?"<>|]/g, '-').trim()}.md`;
		let fullPath = targetFolder.path === '/' ? fileName : `${targetFolder.path}/${fileName}`;

		// Avoid overwrite
		let counter = 1;
		while (await this.app.vault.adapter.exists(fullPath)) {
			fileName = `${finalTitle.replace(/[\\/:*?"<>|]/g, '-').trim()} (${counter}).md`;
			fullPath = targetFolder.path === '/' ? fileName : `${targetFolder.path}/${fileName}`;
			counter++;
		}

		const startDateStr = data.startDate ? formatDate(data.startDate, this.settings.dateFormat) : '';
		const endDateStr = data.endDate ? formatDate(data.endDate, this.settings.dateFormat) : '';
		const historyDateStr = formatDate(data.startDate || new Date(), this.settings.dateFormat);

		const fileContent = TaskParser.createNewTaskTemplate({
			title: finalTitle,
			tipo: data.tipo,
			taskId: data.taskId,
			projeto: data.projeto,
			startDate: startDateStr,
			endDate: endDateStr,
			status: data.status || 'todo',
			tags: data.tags,
			priority: data.priority,
			body: data.body,
			link: data.link,
			tarefa: data.tarefa,
			child: data.child,
			initialHistoryDate: historyDateStr,
			useWikilinks: this.settings.useWikilinksInHistory,
		});

		const file = await this.app.vault.create(fullPath, fileContent);
		new Notice(`Created task: ${finalTitle}`);
		await this.reloadFile(file);
		return file;
	}

	async updateTaskStatus(task: Task, newStatus: string, date: Date = new Date()): Promise<void> {
		if (task.status.toLowerCase() === newStatus.toLowerCase()) {
			return;
		}

		const dateStr = formatDate(date, this.settings.dateFormat);
		let startUpdate: string | undefined;
		let endUpdate: string | undefined;

		// Auto set start date if not set and moving to in-progress/dev
		if (!task.startDate && this.settings.autoSetDatesOnStatusChange) {
			startUpdate = dateStr;
		}

		// Auto set end date if moving to done
		if (
			(newStatus.toLowerCase() === 'done' || newStatus.toLowerCase() === 'completed') &&
			!task.endDate
		) {
			endUpdate = dateStr;
		}

		const rawContent = await this.app.vault.read(task.file);
		const updatedContent = TaskParser.applyStatusTransition(
			rawContent,
			newStatus,
			dateStr,
			this.settings.useWikilinksInHistory,
			startUpdate,
			endUpdate
		);

		await this.app.vault.modify(task.file, updatedContent);
		await this.reloadFile(task.file);
		new Notice(`Updated status to "${newStatus}" in ${task.title}`);
	}

	async updateTaskDates(task: Task, startDate: Date | null, endDate: Date | null): Promise<void> {
		const rawContent = await this.app.vault.read(task.file);
		const startStr = startDate ? formatDate(startDate, this.settings.dateFormat) : '';
		const endStr = endDate ? formatDate(endDate, this.settings.dateFormat) : '';

		const updatedContent = TaskParser.updateFrontmatter(rawContent, {
			start: startStr,
			end: endStr,
		});

		await this.app.vault.modify(task.file, updatedContent);
		await this.reloadFile(task.file);
	}

	async updateTaskMetadata(task: Task, updates: Record<string, unknown>): Promise<void> {
		const rawContent = await this.app.vault.read(task.file);
		const updatedContent = TaskParser.updateFrontmatter(rawContent, updates);
		await this.app.vault.modify(task.file, updatedContent);
		await this.reloadFile(task.file);
	}

	async addHistoryEntry(task: Task, date: Date, status: string): Promise<void> {
		const rawContent = await this.app.vault.read(task.file);
		const dateStr = formatDate(date, this.settings.dateFormat);
		const line = this.settings.useWikilinksInHistory
			? `- [[${dateStr}]] - ${status}`
			: `- ${dateStr} - ${status}`;

		let updated = TaskParser.appendHistoryLine(rawContent, line);
		updated = TaskParser.updateFrontmatter(updated, { status });

		await this.app.vault.modify(task.file, updated);
		await this.reloadFile(task.file);
		new Notice(`Logged history for ${task.title}`);
	}

	async deleteTask(task: Task): Promise<void> {
		await this.app.fileManager.trashFile(task.file);
		this.tasks.delete(task.file.path);
		this.notifyListeners();
		new Notice(`Deleted task: ${task.title}`);
	}
}
