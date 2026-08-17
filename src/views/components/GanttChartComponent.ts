import { Menu, setIcon } from 'obsidian';
import type GanttPlugin from '../../main';
import { TaskParser } from '../../parser/TaskParser';
import { FolderTreeNode, GanttScale, Task, TreeRenderItem } from '../../types';
import {
	addDays,
	diffInDays,
	formatDate,
	formatDisplayDate,
	formatShortDate,
	generateTimelineColumns,
	isSameDay,
	startOfDay,
	TimelineColumn,
	TimelineHeaderGroup,
} from '../../utils/dateUtils';
import { createStatusBadge, getFolderColor, getStatusColor } from '../../utils/domUtils';
import { StatusPickerModal } from './StatusPickerModal';
import { TaskModal } from './TaskModal';

export class GanttChartComponent {
	plugin: GanttPlugin;
	containerEl: HTMLElement;
	tasks: Task[] = [];
	scale: GanttScale = 'day';
	showSegments = true;
	groupByFolder = true;
	collapsedFolders: Set<string> = new Set();
	onTaskUpdate?: () => void;

	private minDate: Date = new Date();
	private maxDate: Date = new Date();
	private columns: TimelineColumn[] = [];
	private groups: TimelineHeaderGroup[] = [];

	private timelineScrollEl: HTMLElement | null = null;
	private tableScrollEl: HTMLElement | null = null;
	private gridContainerEl: HTMLElement | null = null;

	constructor(
		plugin: GanttPlugin,
		containerEl: HTMLElement,
		tasks: Task[],
		scale?: GanttScale,
		showSegments?: boolean,
		groupByFolder?: boolean
	) {
		this.plugin = plugin;
		this.containerEl = containerEl;
		this.tasks = tasks;
		this.scale = scale || plugin.settings.defaultScale || 'day';
		this.showSegments = showSegments !== undefined ? showSegments : plugin.settings.showHistorySegmentsByDefault;
		this.groupByFolder = groupByFolder !== undefined ? groupByFolder : plugin.settings.groupByFolder;
	}

	render(): void {
		this.removeAllTooltips();
		this.containerEl.empty();
		this.containerEl.addClass('gantt-chart-container');

		if (this.tasks.length === 0) {
			const empty = this.containerEl.createDiv({ cls: 'gantt-empty-state' });
			empty.createEl('div', { cls: 'gantt-empty-title', text: 'No tasks found' });
			empty.createEl('p', {
				text: 'Create a new task with start/end dates and # History, or adjust your folder filters.',
			});
			const newBtn = empty.createEl('button', { cls: 'mod-cta', text: '+ Create New Task' });
			newBtn.onclick = () => new TaskModal(this.plugin.app, this.plugin).open();
			return;
		}

		// Calculate timeline boundary dates and column layout
		const range = this.calculateDateRange();
		this.minDate = range.minDate;
		this.maxDate = range.maxDate;

		const timelineData = generateTimelineColumns(this.minDate, this.maxDate, this.scale);
		this.columns = timelineData.columns;
		this.groups = timelineData.groups;

		// Build nested folder hierarchy tree
		const treeNodes = this.groupByFolder
			? TaskParser.buildFolderTree(this.tasks, this.plugin.settings.taskFolder)
			: [];

		const renderItems: TreeRenderItem[] = this.groupByFolder
			? TaskParser.flattenVisibleTree(treeNodes, this.collapsedFolders)
			: this.tasks.map((t) => ({
					type: 'task',
					task: t,
					id: t.id,
					level: 0,
					folderNode: null as any,
			  }));

		// Layout: Split Left Table + Right Timeline
		const splitWrapper = this.containerEl.createDiv({ cls: 'gantt-split-wrapper' });

		// Left Table Pane (Task/Project sidebar with Status)
		const leftPane = splitWrapper.createDiv({ cls: 'gantt-left-pane' });
		this.renderLeftTable(leftPane, renderItems);

		// Right Timeline Pane
		const rightPane = splitWrapper.createDiv({ cls: 'gantt-right-pane' });
		this.renderRightTimeline(rightPane, renderItems);

		// Synchronize vertical scroll
		this.syncScroll();
	}

	public removeAllTooltips(): void {
		document.querySelectorAll('.gantt-custom-tooltip').forEach((t) => t.remove());
		document.querySelectorAll('.gantt-drag-floating-tooltip').forEach((t) => t.remove());
	}

	private calculateDateRange(): { minDate: Date; maxDate: Date } {
		let min: Date = new Date();
		let max: Date = new Date();
		let hasDates = false;

		for (const task of this.tasks) {
			const span = this.getTaskSpan(task);
			if (!hasDates || span.startDate < min) min = new Date(span.startDate.getTime());
			if (!hasDates || span.endDate > max) max = new Date(span.endDate.getTime());
			hasDates = true;
		}

		const paddedMin = addDays(min, -7);
		const paddedMax = addDays(max, 14);

		return { minDate: startOfDay(paddedMin), maxDate: startOfDay(paddedMax) };
	}

	public getTaskSpan(task: Task): { startDate: Date; endDate: Date } {
		let start = task.startDate;
		let end = task.endDate;

		if (!start && task.history.length > 0) {
			const sorted = [...task.history].sort((a, b) => a.date.getTime() - b.date.getTime());
			start = sorted[0]?.date || null;
		}

		if (!end && task.history.length > 0) {
			const sorted = [...task.history].sort((a, b) => a.date.getTime() - b.date.getTime());
			end = sorted[sorted.length - 1]?.date || null;
		}

		if (!start) start = new Date();
		if (!end) end = addDays(start, 2);
		if (end < start) end = start;

		return { startDate: startOfDay(start), endDate: startOfDay(end) };
	}

	private renderLeftTable(container: HTMLElement, renderItems: TreeRenderItem[]): void {
		const tableHeader = container.createDiv({ cls: 'gantt-left-header' });
		tableHeader.createDiv({ cls: 'gantt-col-title', text: 'Project / Task' });
		tableHeader.createDiv({ cls: 'gantt-col-status', text: 'Status' });

		this.tableScrollEl = container.createDiv({ cls: 'gantt-left-body' });

		for (const item of renderItems) {
			if (item.type === 'folder') {
				const node = item.node;
				const isCollapsed = item.isCollapsed;
				const folderColor = getFolderColor(node.path, item.level);

				const groupRow = this.tableScrollEl.createDiv({
					cls: `gantt-left-row gantt-group-header-row level-${item.level} ${isCollapsed ? 'is-collapsed' : ''}`,
				});
				groupRow.dataset.groupId = item.id;
				groupRow.style.setProperty('--folder-color', folderColor);

				const titleCell = groupRow.createDiv({ cls: 'gantt-col-title' });
				titleCell.style.paddingLeft = `${8 + item.level * 16}px`;

				const toggleIcon = titleCell.createSpan({ cls: 'gantt-group-toggle-icon' });
				setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

				const folderIcon = titleCell.createSpan({ cls: 'gantt-group-folder-icon' });
				setIcon(folderIcon, isCollapsed ? 'folder' : 'folder-open');
				folderIcon.style.color = folderColor;

				titleCell.createSpan({
					cls: 'gantt-group-name',
					text: node.name,
				});

				const countBadge = groupRow.createDiv({ cls: 'gantt-group-count-badge' });
				countBadge.createSpan({ text: `${node.completedCount}/${node.totalCount}` });

				// Empty status placeholder for alignment
				groupRow.createDiv({ cls: 'gantt-col-status' });

				groupRow.onclick = () => {
					if (this.collapsedFolders.has(item.id)) {
						this.collapsedFolders.delete(item.id);
					} else {
						this.collapsedFolders.add(item.id);
					}
					this.render();
				};

				groupRow.onmouseenter = () => this.highlightGroupRow(item.id, true);
				groupRow.onmouseleave = () => this.highlightGroupRow(item.id, false);
			} else {
				const task = item.task;
				const row = this.tableScrollEl.createDiv({
					cls: `gantt-left-row level-${item.level}`,
				});
				row.dataset.taskId = task.id;

				// Task Title Cell
				const titleCell = row.createDiv({ cls: 'gantt-col-title' });
				titleCell.style.paddingLeft = `${16 + item.level * 16}px`;

				const titleLink = titleCell.createEl('a', {
					cls: 'gantt-task-link',
					text: task.title,
				});
				titleLink.onclick = (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.plugin.app.workspace.getLeaf(false).openFile(task.file);
				};

				const editIcon = titleCell.createSpan({ cls: 'gantt-edit-task-icon', title: 'Edit Task' });
				setIcon(editIcon, 'pencil');
				editIcon.onclick = (e) => {
					e.stopPropagation();
					new TaskModal(this.plugin.app, this.plugin, task).open();
				};

				// Status Badge Cell
				const statusCell = row.createDiv({ cls: 'gantt-col-status' });
				const badge = createStatusBadge(statusCell, task.status, this.plugin.settings.statuses, true);
				badge.onclick = (e) => {
					e.stopPropagation();
					new StatusPickerModal(this.plugin.app, this.plugin, task).open();
				};

				// Row click opens note
				row.onclick = (e) => {
					if (
						(e.target as HTMLElement).tagName === 'A' ||
						(e.target as HTMLElement).tagName === 'BUTTON' ||
						(e.target as HTMLElement).hasClass('gantt-status-badge') ||
						(e.target as HTMLElement).hasClass('gantt-edit-task-icon')
					)
						return;

					if (this.plugin.settings.clickAction === 'edit-modal') {
						new TaskModal(this.plugin.app, this.plugin, task).open();
					} else {
						this.plugin.app.workspace.getLeaf(false).openFile(task.file);
					}
				};

				// Hover highlight synchronization
				row.onmouseenter = () => this.highlightRow(task.id, true);
				row.onmouseleave = () => this.highlightRow(task.id, false);
			}
		}
	}

	private renderRightTimeline(container: HTMLElement, renderItems: TreeRenderItem[]): void {
		const totalWidth = this.columns.reduce((acc, col) => acc + col.width, 0);

		// Header
		const headerWrap = container.createDiv({ cls: 'gantt-right-header-wrap' });
		headerWrap.style.width = `${totalWidth}px`;

		// Group Header Row (Months / Years)
		const groupRow = headerWrap.createDiv({ cls: 'gantt-header-group-row' });
		for (const g of this.groups) {
			const spanWidth = this.columns
				.slice(g.startIndex, g.startIndex + g.span)
				.reduce((a, c) => a + c.width, 0);
			const gCell = groupRow.createDiv({ cls: 'gantt-header-group-cell', text: g.label });
			gCell.style.width = `${spanWidth}px`;
		}

		// Column Header Row (Days / Weeks)
		const colRow = headerWrap.createDiv({ cls: 'gantt-header-col-row' });
		for (const col of this.columns) {
			const cCell = colRow.createDiv({
				cls: `gantt-header-col-cell ${col.isToday ? 'is-today' : ''} ${col.isWeekend ? 'is-weekend' : ''}`,
			});
			cCell.style.width = `${col.width}px`;
			cCell.createSpan({ cls: 'gantt-header-col-label', text: col.label });
			if (col.subLabel) {
				cCell.createSpan({ cls: 'gantt-header-col-sub', text: col.subLabel });
			}
		}

		// Timeline Body
		this.timelineScrollEl = container.createDiv({ cls: 'gantt-right-body' });
		this.gridContainerEl = this.timelineScrollEl.createDiv({ cls: 'gantt-grid-container' });
		this.gridContainerEl.style.width = `${totalWidth}px`;

		// Grid background columns
		const gridBg = this.gridContainerEl.createDiv({ cls: 'gantt-grid-bg' });
		for (const col of this.columns) {
			const bgCol = gridBg.createDiv({
				cls: `gantt-grid-bg-col ${col.isToday ? 'is-today' : ''} ${col.isWeekend ? 'is-weekend' : ''}`,
			});
			bgCol.style.width = `${col.width}px`;
		}

		// Today Vertical Line Indicator
		this.renderTodayLine(this.gridContainerEl);

		// Rows Container
		const rowsContainer = this.gridContainerEl.createDiv({ cls: 'gantt-rows-container' });

		for (const item of renderItems) {
			if (item.type === 'folder') {
				const node = item.node;
				const isCollapsed = item.isCollapsed;
				const folderColor = getFolderColor(node.path, item.level);

				const groupRow = rowsContainer.createDiv({
					cls: `gantt-timeline-row gantt-group-header-row level-${item.level} ${isCollapsed ? 'is-collapsed' : ''}`,
				});
				groupRow.dataset.groupId = item.id;
				groupRow.style.setProperty('--folder-color', folderColor);

				if (node.startDate && node.endDate) {
					const leftPx = this.calculateLeftPosition(node.startDate);
					const widthPx = this.calculateWidth(node.startDate, node.endDate);

					const projectBar = groupRow.createDiv({ cls: 'gantt-project-summary-bar' });
					projectBar.style.left = `${leftPx}px`;
					projectBar.style.width = `${widthPx}px`;

					const progressFill = projectBar.createDiv({ cls: 'gantt-project-progress-fill' });
					progressFill.style.width = `${node.progress}%`;

					projectBar.createSpan({
						cls: 'gantt-project-summary-label',
						text: `${node.name} (${node.progress}%)`,
					});
				}

				groupRow.onmouseenter = () => this.highlightGroupRow(item.id, true);
				groupRow.onmouseleave = () => this.highlightGroupRow(item.id, false);
			} else {
				const task = item.task;
				const rowEl = rowsContainer.createDiv({ cls: `gantt-timeline-row level-${item.level}` });
				rowEl.dataset.taskId = task.id;

				this.renderInteractiveTaskBar(rowEl, task);

				rowEl.onmouseenter = () => this.highlightRow(task.id, true);
				rowEl.onmouseleave = () => this.highlightRow(task.id, false);
			}
		}
	}

	private renderTodayLine(container: HTMLElement): void {
		const today = startOfDay(new Date());
		const leftPos = this.calculateLeftPosition(today);
		const colWidth = this.columns[0]?.width || 36;

		const line = container.createDiv({ cls: 'gantt-today-line' });
		line.style.left = `${leftPos + colWidth / 2}px`;
		line.createDiv({ cls: 'gantt-today-line-badge', text: 'Today' });
	}

	/**
	 * Renders interactive task bar with Drag to Move, Left Resize Handle, and Right Resize Handle
	 */
	private renderInteractiveTaskBar(rowEl: HTMLElement, task: Task): void {
		const span = this.getTaskSpan(task);
		const initialLeftPx = this.calculateLeftPosition(span.startDate);
		const initialWidthPx = this.calculateWidth(span.startDate, span.endDate);

		const barEl = rowEl.createDiv({ cls: 'gantt-task-bar' });
		barEl.style.left = `${initialLeftPx}px`;
		barEl.style.width = `${initialWidthPx}px`;

		// Left Resize Handle
		const leftHandle = barEl.createDiv({
			cls: 'gantt-resize-handle handle-left',
			title: 'Arraste para alterar data de início',
		});

		// Inner Content Area (Only Task Title, No Status Name on Timeline Bar)
		const contentArea = barEl.createDiv({ cls: 'gantt-bar-inner-content' });

		const totalBarDays = Math.max(1, diffInDays(span.startDate, span.endDate) + 1);

		if (this.showSegments && task.segments.length > 0) {
			barEl.addClass('is-segmented');
			this.renderSegmentedBar(contentArea, task, totalBarDays);
		} else {
			const statusColor = getStatusColor(task.status, this.plugin.settings.statuses);
			barEl.style.backgroundColor = statusColor;
			contentArea.createSpan({ cls: 'gantt-bar-label', text: task.title });
		}

		// Right Resize Handle
		const rightHandle = barEl.createDiv({
			cls: 'gantt-resize-handle handle-right',
			title: 'Arraste para alterar data de término',
		});

		// Attach Drag and Resize handlers
		this.setupInteractiveDrag(barEl, leftHandle, rightHandle, task, span);

		// Tooltip
		this.attachTooltip(barEl, task);

		// Context Menu
		barEl.oncontextmenu = (e) => {
			e.preventDefault();
			const menu = new Menu();
			menu.addItem((item) =>
				item
					.setTitle('Abrir nota')
					.setIcon('file-text')
					.onClick(() => this.plugin.app.workspace.getLeaf(false).openFile(task.file))
			);
			menu.addItem((item) =>
				item
					.setTitle('Editar tarefa')
					.setIcon('pencil')
					.onClick(() => new TaskModal(this.plugin.app, this.plugin, task).open())
			);
			menu.addItem((item) =>
				item
					.setTitle('Alterar status')
					.setIcon('check-circle')
					.onClick(() => new StatusPickerModal(this.plugin.app, this.plugin, task).open())
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle('Excluir tarefa')
					.setIcon('trash')
					.setWarning(true)
					.onClick(() => this.plugin.taskManager.deleteTask(task))
			);
			menu.showAtMouseEvent(e);
		};
	}

	private setupInteractiveDrag(
		barEl: HTMLElement,
		leftHandle: HTMLElement,
		rightHandle: HTMLElement,
		task: Task,
		initialSpan: { startDate: Date; endDate: Date }
	): void {
		let dragType: 'left' | 'right' | 'move' | null = null;
		let startMouseX = 0;
		let hasMoved = false;

		let currentStart = new Date(initialSpan.startDate.getTime());
		let currentEnd = new Date(initialSpan.endDate.getTime());

		const getTooltipEl = () => {
			let tt = document.body.querySelector('.gantt-drag-floating-tooltip') as HTMLElement;
			if (!tt) {
				tt = document.body.createDiv({ cls: 'gantt-drag-floating-tooltip' });
			}
			return tt;
		};

		const onMouseMove = (e: MouseEvent) => {
			if (!dragType || !this.gridContainerEl) return;

			const deltaX = e.clientX - startMouseX;
			if (Math.abs(deltaX) > 4) {
				hasMoved = true;
			}

			if (!hasMoved) return;

			const gridRect = this.gridContainerEl.getBoundingClientRect();
			const pixelX = e.clientX - gridRect.left;

			if (dragType === 'left') {
				const candidateStart = this.getDateFromPixelX(pixelX);
				if (candidateStart <= currentEnd) {
					currentStart = candidateStart;
					const newLeft = this.calculateLeftPosition(currentStart);
					const newWidth = this.calculateWidth(currentStart, currentEnd);

					barEl.style.left = `${newLeft}px`;
					barEl.style.width = `${newWidth}px`;

					const tt = getTooltipEl();
					tt.setText(`📅 Início: ${formatDate(currentStart, 'DD-MM-YYYY')}`);
					tt.style.top = `${e.clientY - 34}px`;
					tt.style.left = `${e.clientX + 14}px`;
				}
			} else if (dragType === 'right') {
				const candidateEnd = this.getDateFromPixelX(pixelX);
				if (candidateEnd >= currentStart) {
					currentEnd = candidateEnd;
					const newWidth = this.calculateWidth(currentStart, currentEnd);

					barEl.style.width = `${newWidth}px`;

					const tt = getTooltipEl();
					tt.setText(`📅 Fim: ${formatDate(currentEnd, 'DD-MM-YYYY')}`);
					tt.style.top = `${e.clientY - 34}px`;
					tt.style.left = `${e.clientX + 14}px`;
				}
			} else if (dragType === 'move') {
				barEl.addClass('is-moving');
				const pixelsPerDay = this.getPixelsPerDay();
				const deltaDays = Math.round(deltaX / pixelsPerDay);

				currentStart = addDays(initialSpan.startDate, deltaDays);
				currentEnd = addDays(initialSpan.endDate, deltaDays);

				const newLeft = this.calculateLeftPosition(currentStart);
				barEl.style.left = `${newLeft}px`;

				const sign = deltaDays >= 0 ? `+${deltaDays}` : `${deltaDays}`;
				const tt = getTooltipEl();
				tt.setText(
					`📅 ${formatDate(currentStart, 'DD-MM-YYYY')} → ${formatDate(currentEnd, 'DD-MM-YYYY')} (${sign}d)`
				);
				tt.style.top = `${e.clientY - 34}px`;
				tt.style.left = `${e.clientX + 14}px`;
			}
		};

		const onMouseUp = async (e: MouseEvent) => {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			barEl.removeClass('is-moving');
			this.removeAllTooltips();

			if (!dragType) return;

			if (hasMoved) {
				await this.plugin.taskManager.updateTaskDates(task, currentStart, currentEnd);
			} else if (dragType === 'move') {
				// Clean click without drag -> Open note in Obsidian workspace
				if (this.plugin.settings.clickAction === 'edit-modal') {
					new TaskModal(this.plugin.app, this.plugin, task).open();
				} else {
					this.plugin.app.workspace.getLeaf(false).openFile(task.file);
				}
			}

			dragType = null;
		};

		leftHandle.onmousedown = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.removeAllTooltips();
			dragType = 'left';
			startMouseX = e.clientX;
			hasMoved = false;
			currentStart = new Date(initialSpan.startDate.getTime());
			currentEnd = new Date(initialSpan.endDate.getTime());
			window.addEventListener('mousemove', onMouseMove);
			window.addEventListener('mouseup', onMouseUp);
		};

		rightHandle.onmousedown = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.removeAllTooltips();
			dragType = 'right';
			startMouseX = e.clientX;
			hasMoved = false;
			currentStart = new Date(initialSpan.startDate.getTime());
			currentEnd = new Date(initialSpan.endDate.getTime());
			window.addEventListener('mousemove', onMouseMove);
			window.addEventListener('mouseup', onMouseUp);
		};

		barEl.onmousedown = (e) => {
			if (e.target === leftHandle || e.target === rightHandle) return;
			if (e.button !== 0) return;
			e.preventDefault();
			this.removeAllTooltips();
			dragType = 'move';
			startMouseX = e.clientX;
			hasMoved = false;
			currentStart = new Date(initialSpan.startDate.getTime());
			currentEnd = new Date(initialSpan.endDate.getTime());
			window.addEventListener('mousemove', onMouseMove);
			window.addEventListener('mouseup', onMouseUp);
		};
	}

	private renderSegmentedBar(container: HTMLElement, task: Task, totalBarDays: number): void {
		for (const seg of task.segments) {
			const pct = (seg.durationDays / Math.max(1, totalBarDays)) * 100;
			const segEl = container.createDiv({
				cls: `gantt-bar-segment ${seg.isRework ? 'is-rework' : ''}`,
			});
			segEl.style.width = `${pct}%`;
			segEl.style.backgroundColor = seg.color || getStatusColor(seg.status, this.plugin.settings.statuses);
			segEl.title = `${seg.status}: ${seg.durationDays}d (${seg.formattedStart} - ${seg.formattedEnd})${
				seg.isRework ? ' [Rework]' : ''
			}`;
			// Note: No status name text inside segment, purely colored flow
		}

		container.createSpan({ cls: 'gantt-bar-overlay-label', text: task.title });
	}

	private getPixelsPerDay(): number {
		const colWidth = this.columns[0]?.width || 36;
		if (this.scale === 'day') return colWidth;
		if (this.scale === 'week') return colWidth / 7;
		if (this.scale === 'month') return colWidth / 30;
		if (this.scale === 'quarter') return colWidth / 91;
		return colWidth / 365;
	}

	private calculateLeftPosition(date: Date): number {
		const target = startOfDay(date);
		const colWidth = this.columns[0]?.width || 36;

		if (this.scale === 'day') {
			const days = diffInDays(this.minDate, target);
			return Math.max(0, days * colWidth);
		} else {
			let accumulated = 0;
			for (let i = 0; i < this.columns.length; i++) {
				const col = this.columns[i]!;
				const nextCol = this.columns[i + 1];

				if (!nextCol || target < nextCol.date) {
					const colSpanDays = nextCol ? Math.max(1, diffInDays(col.date, nextCol.date)) : 7;
					const daysIntoCol = Math.max(0, diffInDays(col.date, target));
					const fraction = Math.min(1, daysIntoCol / colSpanDays);
					return Math.max(0, accumulated + fraction * col.width);
				}
				accumulated += col.width;
			}
			return Math.max(0, accumulated);
		}
	}

	private calculateWidth(startDate: Date, endDate: Date): number {
		const start = startOfDay(startDate);
		const end = startOfDay(endDate);
		const colWidth = this.columns[0]?.width || 36;

		const leftStart = this.calculateLeftPosition(start);
		const leftEnd = this.calculateLeftPosition(addDays(end, 1));

		return Math.max(colWidth, leftEnd - leftStart);
	}

	private getDateFromPixelX(pixelX: number): Date {
		const colWidth = this.columns[0]?.width || 36;

		if (this.scale === 'day') {
			const days = Math.floor(Math.max(0, pixelX) / colWidth);
			return addDays(this.minDate, days);
		} else {
			let accumulated = 0;
			for (let i = 0; i < this.columns.length; i++) {
				const col = this.columns[i]!;
				const nextCol = this.columns[i + 1];

				if (pixelX <= accumulated + col.width || !nextCol) {
					const fraction = Math.max(0, Math.min(1, (pixelX - accumulated) / col.width));
					const colSpanDays = nextCol ? Math.max(1, diffInDays(col.date, nextCol.date)) : 7;
					const dayOffset = Math.floor(fraction * colSpanDays);
					return addDays(col.date, dayOffset);
				}
				accumulated += col.width;
			}
			return this.minDate;
		}
	}

	private attachTooltip(el: HTMLElement, task: Task): void {
		el.onmouseenter = (e) => {
			if (document.body.querySelector('.gantt-drag-floating-tooltip')) return;
			if (el.hasClass('is-moving')) return;

			this.removeAllTooltips();

			const tooltip = document.body.createDiv({ cls: 'gantt-custom-tooltip' });
			tooltip.createEl('div', { cls: 'gantt-tooltip-title', text: task.title });

			const metaRow = tooltip.createDiv({ cls: 'gantt-tooltip-meta' });
			metaRow.createSpan({ text: `📁 Projeto: ${task.project}` });
			metaRow.createSpan({ text: `⚡ Status: ${task.status}` });
			if (task.assignee) metaRow.createSpan({ text: `👤 Resp: ${task.assignee}` });

			const dateRow = tooltip.createDiv({ cls: 'gantt-tooltip-dates' });
			dateRow.createSpan({ text: `📅 ${task.formattedStart || '-'} → ${task.formattedEnd || '-'}` });
			dateRow.createSpan({ text: `⏱ Total: ${task.totalLeadTimeDays}d` });

			if (task.history.length > 0) {
				tooltip.createDiv({ cls: 'gantt-tooltip-hist-header', text: 'Status History Flow:' });
				const histList = tooltip.createDiv({ cls: 'gantt-tooltip-hist-list' });
				for (const h of task.history) {
					histList.createDiv({
						cls: 'gantt-tooltip-hist-item',
						text: `• ${h.formattedDate} — ${h.status}`,
					});
				}
			}

			if (task.reworkCount > 0) {
				tooltip.createDiv({
					cls: 'gantt-tooltip-rework',
					text: `⚠️ ${task.reworkCount} rework transition(s) detected`,
				});
			}

			const moveTooltip = (moveEvt: MouseEvent) => {
				tooltip.style.top = `${moveEvt.clientY + 14}px`;
				tooltip.style.left = `${moveEvt.clientX + 14}px`;
			};

			moveTooltip(e);
			el.addEventListener('mousemove', moveTooltip);

			el.onmouseleave = () => {
				tooltip.remove();
				el.removeEventListener('mousemove', moveTooltip);
			};
		};
	}

	private highlightRow(taskId: string, highlight: boolean): void {
		const rows = this.containerEl.querySelectorAll(`[data-task-id="${CSS.escape(taskId)}"]`);
		rows.forEach((r) => {
			if (highlight) r.addClass('is-hovered');
			else r.removeClass('is-hovered');
		});
	}

	private highlightGroupRow(groupId: string, highlight: boolean): void {
		const rows = this.containerEl.querySelectorAll(`[data-group-id="${CSS.escape(groupId)}"]`);
		rows.forEach((r) => {
			if (highlight) r.addClass('is-hovered');
			else r.removeClass('is-hovered');
		});
	}

	private syncScroll(): void {
		const leftEl = this.tableScrollEl;
		const rightEl = this.timelineScrollEl;
		if (!leftEl || !rightEl) return;

		let isSyncingLeft = false;
		let isSyncingRight = false;

		leftEl.addEventListener('scroll', () => {
			if (!isSyncingLeft && rightEl) {
				isSyncingRight = true;
				rightEl.scrollTop = leftEl.scrollTop;
			}
			isSyncingLeft = false;
		});

		rightEl.addEventListener('scroll', () => {
			if (!isSyncingRight && leftEl) {
				isSyncingLeft = true;
				leftEl.scrollTop = rightEl.scrollTop;
			}
			isSyncingRight = false;
		});
	}
}
