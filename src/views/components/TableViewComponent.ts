import { setIcon } from 'obsidian';
import type GanttPlugin from '../../main';
import { TaskParser } from '../../parser/TaskParser';
import { Task, TreeRenderItem } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { createStatusBadge, getFolderColor, getStatusColor } from '../../utils/domUtils';
import { StatusPickerModal } from './StatusPickerModal';
import { TaskModal } from './TaskModal';

export class TableViewComponent {
	plugin: GanttPlugin;
	containerEl: HTMLElement;
	tasks: Task[] = [];
	sortColumn: string = 'title';
	sortDirection: 'asc' | 'desc' = 'asc';
	collapsedFolders: Set<string> = new Set();
	onTaskUpdate?: () => void;

	constructor(plugin: GanttPlugin, containerEl: HTMLElement, tasks: Task[]) {
		this.plugin = plugin;
		this.containerEl = containerEl;
		this.tasks = tasks;
	}

	render(): void {
		this.containerEl.empty();
		this.containerEl.addClass('gantt-table-view');

		if (this.tasks.length === 0) {
			const empty = this.containerEl.createDiv({ cls: 'gantt-empty-state' });
			empty.createDiv({ cls: 'gantt-empty-title', text: 'No tasks found' });
			const newBtn = empty.createEl('button', { cls: 'mod-cta', text: '+ create new task' });
			newBtn.onclick = () => new TaskModal(this.plugin.app, this.plugin).open();
			return;
		}

		// Build nested tree
		const treeNodes = this.plugin.settings.groupByFolder
			? TaskParser.buildFolderTree(this.tasks, this.plugin.settings.taskFolder)
			: [];

		const sorted = this.getSortedTasks(this.tasks);
		const ordered = TaskParser.orderTasksByBacklogHierarchy(sorted);
		const renderItems: TreeRenderItem[] = this.plugin.settings.groupByFolder
			? TaskParser.flattenVisibleTree(treeNodes, this.collapsedFolders)
			: ordered.map((t) => {
					const isChild = !!(
						t.parentBg &&
						ordered.some((p) => p.title === t.parentBg || (p.child && p.child.includes(t.title)))
					);
					return {
						type: 'task' as const,
						task: t,
						id: t.id,
						level: isChild ? 1 : 0,
						folderNode: undefined,
						isChildOfBg: isChild,
					};
			  });

		// Table element
		const table = this.containerEl.createEl('table', { cls: 'gantt-data-table' });

		// Table Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');

		this.createHeaderCell(headerRow, 'Project / Task', 'title');
		this.createHeaderCell(headerRow, 'Status', 'status');
		this.createHeaderCell(headerRow, 'Start Date', 'start');
		this.createHeaderCell(headerRow, 'End Date', 'end');
		this.createHeaderCell(headerRow, 'Duration', 'duration');
		this.createHeaderCell(headerRow, 'Tags', undefined);
		this.createHeaderCell(headerRow, 'Status History Flow', 'rework');
		this.createHeaderCell(headerRow, 'Actions', undefined);

		// Table Body
		const tbody = table.createEl('tbody');

		for (const item of renderItems) {
			if (item.type === 'folder') {
				const node = item.node;
				const isCollapsed = item.isCollapsed;
				const folderColor = getFolderColor(node.path, item.level);
				const groupRow = tbody.createEl('tr', {
					cls: `gantt-table-group-row level-${item.level} ${isCollapsed ? 'is-collapsed' : ''}`,
				});
				groupRow.style.setProperty('--folder-color', folderColor);
				const groupCell = groupRow.createEl('td', {
					attr: { colspan: '8' },
					cls: 'gantt-table-group-cell',
				});
				groupCell.style.paddingLeft = `${4 + item.level * 16}px`;

				const toggleIcon = groupCell.createSpan({ cls: 'gantt-group-toggle-icon' });
				setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

				const folderIcon = groupCell.createSpan({ cls: 'gantt-group-folder-icon' });
				setIcon(folderIcon, isCollapsed ? 'folder' : 'folder-open');
				folderIcon.style.color = folderColor;

				groupCell.createSpan({
					cls: 'gantt-group-leaf-name',
					text: node.name,
				});

				groupCell.createSpan({
					cls: 'gantt-group-meta',
					text: `(${node.completedCount}/${node.totalCount} completed • ${node.progress}%)`,
				});

				groupRow.onclick = () => {
					if (this.collapsedFolders.has(item.id)) {
						this.collapsedFolders.delete(item.id);
					} else {
						this.collapsedFolders.add(item.id);
					}
					this.render();
				};
			} else {
				const task = item.task;
				const isChild = !!item.isChildOfBg;
				const row = tbody.createEl('tr', {
					cls: `gantt-table-row level-${item.level} ${isChild ? 'is-bg-child' : ''}`,
				});

				// Title
				const titleCell = row.createEl('td', { cls: 'gantt-table-title-cell' });
				titleCell.style.paddingLeft = `${28 + item.level * 16}px`;

				if (isChild) {
					titleCell.createSpan({ cls: 'gantt-tree-branch-prefix', text: '└─ ' });
				}

				const link = titleCell.createEl('a', {
					cls: 'gantt-task-link',
					text: task.title,
				});
				link.onclick = (e) => {
					e.preventDefault();
					void this.plugin.app.workspace.getLeaf(false).openFile(task.file);
				};

				// Status
				const statusCell = row.createEl('td', { cls: 'gantt-table-status-cell' });
				const badge = createStatusBadge(statusCell, task.status, this.plugin.settings.statuses, true);
				badge.onclick = (e) => {
					e.stopPropagation();
					new StatusPickerModal(this.plugin.app, this.plugin, task).open();
				};

				// Start Date
				const startCell = row.createEl('td');
				startCell.setText(task.formattedStart || '-');

				// End Date
				const endCell = row.createEl('td');
				endCell.setText(task.formattedEnd || '-');

				// Duration
				const durCell = row.createEl('td');
				durCell.setText(`${task.totalLeadTimeDays}d`);

				// Tags
				const tagsCell = row.createEl('td');
				for (const tag of task.tags) {
					tagsCell.createSpan({ cls: 'gantt-tag-pill', text: `#${tag}` });
				}

				// Status History Flow
				const historyCell = row.createEl('td', { cls: 'gantt-table-history-cell' });
				this.renderHistoryFlow(historyCell, task);

				// Actions
				const actionsCell = row.createEl('td', { cls: 'gantt-table-actions-cell' });
				const editBtn = actionsCell.createEl('button', {
					cls: 'clickable-icon',
					attr: { 'aria-label': 'Edit task' },
				});
				setIcon(editBtn, 'pencil');
				editBtn.onclick = (e) => {
					e.stopPropagation();
					new TaskModal(this.plugin.app, this.plugin, task).open();
				};

				const openBtn = actionsCell.createEl('button', {
					cls: 'clickable-icon',
					attr: { 'aria-label': 'Open note' },
				});
				setIcon(openBtn, 'file-text');
				openBtn.onclick = (e) => {
					e.stopPropagation();
					void this.plugin.app.workspace.getLeaf(false).openFile(task.file);
				};
			}
		}
	}

	private renderHistoryFlow(container: HTMLElement, task: Task): void {
		if (task.history.length === 0) {
			container.createSpan({ cls: 'gantt-text-muted', text: 'No history' });
			return;
		}

		const flowWrap = container.createDiv({ cls: 'gantt-history-flow-badges' });

		for (let i = 0; i < task.history.length; i++) {
			const entry = task.history[i]!;

			if (i > 0) {
				flowWrap.createSpan({ cls: 'gantt-flow-arrow', text: '→' });
			}

			const badge = flowWrap.createSpan({
				cls: 'gantt-flow-step-badge',
				text: `${entry.status} (${formatDate(entry.date, this.plugin.settings.dateFormat)})`,
			});
			badge.style.backgroundColor = getStatusColor(entry.status, this.plugin.settings.statuses);
		}

		if (task.reworkCount > 0) {
			flowWrap.createSpan({
				cls: 'gantt-rework-indicator-badge',
				text: `⚠️ ${task.reworkCount} rework`,
				title: `${task.reworkCount} backward transition(s) detected`,
			});
		}
	}

	private createHeaderCell(
		row: HTMLElement,
		label: string,
		sortKey?: string
	): HTMLElement {
		const th = row.createEl('th', { cls: sortKey ? 'is-sortable' : '' });
		const wrap = th.createDiv({ cls: 'gantt-th-content' });
		wrap.createSpan({ text: label });

		if (sortKey) {
			const iconSpan = wrap.createSpan({ cls: 'gantt-sort-icon' });
			if (this.sortColumn === sortKey) {
				setIcon(iconSpan, this.sortDirection === 'asc' ? 'arrow-up' : 'arrow-down');
			}

			th.onclick = () => {
				if (this.sortColumn === sortKey) {
					this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
				} else {
					this.sortColumn = sortKey;
					this.sortDirection = 'asc';
				}
				this.render();
			};
		}

		return th;
	}

	private getSortedTasks(tasks: Task[]): Task[] {
		return [...tasks].sort((a, b) => {
			let valA: string | number;
			let valB: string | number;

			switch (this.sortColumn) {
				case 'title':
					valA = a.title.toLowerCase();
					valB = b.title.toLowerCase();
					break;
				case 'status':
					valA = a.status.toLowerCase();
					valB = b.status.toLowerCase();
					break;
				case 'start':
					valA = a.startDate?.getTime() || 0;
					valB = b.startDate?.getTime() || 0;
					break;
				case 'end':
					valA = a.endDate?.getTime() || 0;
					valB = b.endDate?.getTime() || 0;
					break;
				case 'duration':
					valA = a.totalLeadTimeDays;
					valB = b.totalLeadTimeDays;
					break;
				case 'rework':
					valA = a.reworkCount;
					valB = b.reworkCount;
					break;
				default:
					valA = a.title.toLowerCase();
					valB = b.title.toLowerCase();
			}

			if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
			if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
			return 0;
		});
	}
}
