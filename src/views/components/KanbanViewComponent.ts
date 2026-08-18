import { Menu, setIcon } from 'obsidian';
import type GanttPlugin from '../../main';
import { Task } from '../../types';
import { createTagPill, getStatusColor, normalizeStatus } from '../../utils/domUtils';
import { StatusPickerModal } from './StatusPickerModal';
import { TaskModal } from './TaskModal';

export class KanbanViewComponent {
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
		this.containerEl.addClass('gantt-kanban-container');

		// Collect unique canonical columns
		const configuredStatuses = this.plugin.settings.statuses;
		const defaultNormKeys = configuredStatuses.map((s) => normalizeStatus(s.id));
		
		// Ensure standard 4 columns are always present
		const standardKeys = ['todo', 'dev', 'hom', 'done'];
		for (const k of standardKeys) {
			if (!defaultNormKeys.includes(k)) {
				defaultNormKeys.push(k);
			}
		}

		// Also check any non-standard statuses in tasks
		const taskStatusMap = new Map<string, string>(); // normKey -> rawStatus
		for (const t of this.tasks) {
			const norm = normalizeStatus(t.status);
			if (!defaultNormKeys.includes(norm) && !taskStatusMap.has(norm)) {
				taskStatusMap.set(norm, t.status);
			}
		}

		const allColumnKeys = [...defaultNormKeys, ...Array.from(taskStatusMap.keys())];

		const board = this.containerEl.createDiv({ cls: 'gantt-kanban-board' });

		for (const colKey of allColumnKeys) {
			const statusObj = this.plugin.settings.statuses.find(
				(s) => normalizeStatus(s.id) === colKey || normalizeStatus(s.name) === colKey
			);
			let colTitle = statusObj ? statusObj.name : '';
			if (!colTitle) {
				if (colKey === 'todo') colTitle = 'Todo';
				else if (colKey === 'dev') colTitle = 'Dev';
				else if (colKey === 'hom') colTitle = 'Homolog';
				else if (colKey === 'done') colTitle = 'Done';
				else colTitle = taskStatusMap.get(colKey) || colKey.toUpperCase();
			}

			const colColor = getStatusColor(colKey, this.plugin.settings.statuses);
			const colTasks = this.tasks.filter((t) => normalizeStatus(t.status) === colKey);

			const columnEl = board.createDiv({ cls: 'gantt-kanban-column' });
			columnEl.dataset.status = colKey;

			// Column Header
			const colHeader = columnEl.createDiv({ cls: 'gantt-kanban-col-header' });
			const headerLeft = colHeader.createDiv({ cls: 'gantt-kanban-col-left' });
			const dot = headerLeft.createDiv({ cls: 'gantt-kanban-col-dot' });
			dot.style.backgroundColor = colColor;

			headerLeft.createSpan({ cls: 'gantt-kanban-col-title', text: colTitle });
			headerLeft.createSpan({ cls: 'gantt-kanban-col-count', text: `${colTasks.length}` });

			const addBtn = colHeader.createEl('button', {
				cls: 'gantt-kanban-add-btn',
				title: `Add task to ${colTitle}`,
			});
			setIcon(addBtn, 'plus');
			addBtn.onclick = () => {
				new TaskModal(this.plugin.app, this.plugin, undefined, { initialStatus: colTitle.toLowerCase() }).open();
			};

			// Column Cards Body (Drop Zone)
			const cardsBody = columnEl.createDiv({ cls: 'gantt-kanban-cards-body' });

			// Drag & Drop event handlers on column
			this.setupDropZone(cardsBody, colKey);

			for (const task of colTasks) {
				this.renderCard(cardsBody, task);
			}
		}
	}

	private renderCard(container: HTMLElement, task: Task): void {
		const card = container.createDiv({ cls: 'gantt-kanban-card' });
		card.setAttribute('draggable', 'true');
		card.dataset.taskId = task.id;

		// Card Drag Start / End
		card.ondragstart = (e) => {
			if (e.dataTransfer) {
				e.dataTransfer.setData('text/plain', task.id);
				e.dataTransfer.effectAllowed = 'move';
			}
			card.addClass('is-dragging');
		};

		card.ondragend = () => {
			card.removeClass('is-dragging');
		};

		// Card Header: Title + Actions
		const cardHeader = card.createDiv({ cls: 'gantt-card-header' });
		const titleLink = cardHeader.createEl('a', {
			cls: 'gantt-card-title',
			text: task.title,
		});
		titleLink.onclick = (e) => {
			e.preventDefault();
			this.plugin.app.workspace.getLeaf(false).openFile(task.file);
		};

		const editBtn = cardHeader.createEl('button', {
			cls: 'gantt-card-icon-btn',
			title: 'Edit Task',
		});
		setIcon(editBtn, 'pencil');
		editBtn.onclick = (e) => {
			e.stopPropagation();
			new TaskModal(this.plugin.app, this.plugin, task).open();
		};

		// Card Metadata (Dates, Time in Status, Lead Time)
		const metaRow = card.createDiv({ cls: 'gantt-card-meta' });
		if (task.startDate || task.endDate) {
			metaRow.createSpan({
				cls: 'gantt-card-date-badge',
				text: `📅 ${task.formattedStart || '?'} → ${task.formattedEnd || '?'}`,
			});
		}

		if (task.currentStatusDays > 0 && task.status.toLowerCase() !== 'done') {
			metaRow.createSpan({
				cls: 'gantt-card-days-badge',
				text: `⏳ ${task.currentStatusDays}d in ${task.status}`,
			});
		}

		// Assignee & Tags
		const tagRow = card.createDiv({ cls: 'gantt-card-tag-row' });
		if (task.assignee) {
			tagRow.createSpan({ cls: 'gantt-assignee-tag', text: task.assignee });
		}
		for (const t of task.tags) {
			createTagPill(tagRow, t);
		}

		// History Flow Breadcrumbs
		if (task.history.length > 1) {
			const histRow = card.createDiv({ cls: 'gantt-card-history-flow' });
			task.history.slice(-4).forEach((h, idx) => {
				if (idx > 0) histRow.createSpan({ cls: 'gantt-flow-arrow', text: '→' });
				const miniChip = histRow.createSpan({
					cls: 'gantt-card-mini-chip',
					text: h.status,
				});
				miniChip.style.backgroundColor = getStatusColor(h.status, this.plugin.settings.statuses);
			});

			if (task.reworkCount > 0) {
				histRow.createSpan({
					cls: 'gantt-rework-badge-mini',
					text: `⚡${task.reworkCount}`,
					title: `${task.reworkCount} status rework(s)`,
				});
			}
		}

		// Card Click & Context Menu
		card.onclick = (e) => {
			if ((e.target as HTMLElement).tagName === 'A' || (e.target as HTMLElement).tagName === 'BUTTON') return;
			new TaskModal(this.plugin.app, this.plugin, task).open();
		};

		card.oncontextmenu = (e) => {
			e.preventDefault();
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle('Open note')
					.setIcon('file-text')
					.onClick(() => this.plugin.app.workspace.getLeaf(false).openFile(task.file))
			);
			menu.addItem((item) =>
				item
					.setTitle('Change status')
					.setIcon('check-circle')
					.onClick(() => new StatusPickerModal(this.plugin.app, this.plugin, task).open())
			);
			menu.addItem((item) =>
				item
					.setTitle('Edit task')
					.setIcon('pencil')
					.onClick(() => new TaskModal(this.plugin.app, this.plugin, task).open())
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle('Delete task')
					.setIcon('trash')
					.setWarning(true)
					.onClick(() => this.plugin.taskManager.deleteTask(task))
			);
			menu.showAtMouseEvent(e);
		};
	}

	private setupDropZone(dropZone: HTMLElement, targetStatus: string): void {
		dropZone.ondragover = (e) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'move';
			}
			dropZone.addClass('is-drag-over');
		};

		dropZone.ondragleave = () => {
			dropZone.removeClass('is-drag-over');
		};

		dropZone.ondrop = async (e) => {
			e.preventDefault();
			dropZone.removeClass('is-drag-over');

			const taskId = e.dataTransfer?.getData('text/plain');
			if (!taskId) return;

			const task = this.tasks.find((t) => t.id === taskId);
			if (task && task.status.toLowerCase() !== targetStatus.toLowerCase()) {
				await this.plugin.taskManager.updateTaskStatus(task, targetStatus);
			}
		};
	}
}
