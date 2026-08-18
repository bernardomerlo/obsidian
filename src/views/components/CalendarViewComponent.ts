import { setIcon } from 'obsidian';
import type GanttPlugin from '../../main';
import { Task } from '../../types';
import {
	addDays,
	diffInDays,
	endOfMonth,
	endOfWeek,
	formatDate,
	formatDisplayDate,
	isSameDay,
	isToday,
	startOfDay,
	startOfMonth,
	startOfWeek,
} from '../../utils/dateUtils';
import { getStatusColor } from '../../utils/domUtils';
import { TaskModal } from './TaskModal';

export class CalendarViewComponent {
	plugin: GanttPlugin;
	containerEl: HTMLElement;
	tasks: Task[] = [];
	currentDate: Date = new Date();

	constructor(plugin: GanttPlugin, containerEl: HTMLElement, tasks: Task[]) {
		this.plugin = plugin;
		this.containerEl = containerEl;
		this.tasks = tasks;
	}

	render(): void {
		this.containerEl.empty();
		this.containerEl.addClass('gantt-calendar-container');

		// Calendar Header Controls
		const header = this.containerEl.createDiv({ cls: 'gantt-cal-header' });
		
		const navGroup = header.createDiv({ cls: 'gantt-cal-nav' });
		const prevBtn = navGroup.createEl('button', { cls: 'gantt-action-icon-btn' });
		setIcon(prevBtn, 'chevron-left');
		prevBtn.onclick = () => {
			this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
			this.render();
		};

		const todayBtn = navGroup.createEl('button', { cls: 'gantt-btn-sm', text: 'Today' });
		todayBtn.onclick = () => {
			this.currentDate = new Date();
			this.render();
		};

		const nextBtn = navGroup.createEl('button', { cls: 'gantt-action-icon-btn' });
		setIcon(nextBtn, 'chevron-right');
		nextBtn.onclick = () => {
			this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
			this.render();
		};

		const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
		const monthTitle = header.createEl('h2', {
			cls: 'gantt-cal-title',
			text: `${months[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`,
		});

		// Calendar Grid
		const grid = this.containerEl.createDiv({ cls: 'gantt-cal-grid' });

		// Day of week labels
		const daysHeader = grid.createDiv({ cls: 'gantt-cal-days-header' });
		const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
		for (const name of dayNames) {
			daysHeader.createDiv({ cls: 'gantt-cal-day-label', text: name });
		}

		// Calculate dates for month view
		const mStart = startOfMonth(this.currentDate);
		const mEnd = endOfMonth(this.currentDate);
		const gridStart = startOfWeek(mStart, true);
		const gridEnd = endOfWeek(mEnd, true);

		const daysBody = grid.createDiv({ cls: 'gantt-cal-days-body' });
		let curr = new Date(gridStart.getTime());

		while (curr <= gridEnd) {
			const cellDate = new Date(curr.getTime());
			const isCurrMonth = cellDate.getMonth() === this.currentDate.getMonth();
			const isTod = isToday(cellDate);

			const cell = daysBody.createDiv({
				cls: `gantt-cal-cell ${isCurrMonth ? 'is-current-month' : 'is-other-month'} ${isTod ? 'is-today' : ''}`,
			});

			const cellHead = cell.createDiv({ cls: 'gantt-cal-cell-head' });
			cellHead.createSpan({ cls: 'gantt-cal-cell-num', text: `${cellDate.getDate()}` });

			const addCellBtn = cellHead.createSpan({ cls: 'gantt-cal-add-icon', title: 'Add task on this date' });
			setIcon(addCellBtn, 'plus');
			addCellBtn.onclick = (e) => {
				e.stopPropagation();
				new TaskModal(this.plugin.app, this.plugin, undefined, { initialStartDate: cellDate }).open();
			};

			// Tasks active on this date
			const dayTasks = this.getTasksForDate(cellDate);
			const tasksContainer = cell.createDiv({ cls: 'gantt-cal-cell-tasks' });

			for (const task of dayTasks.slice(0, 4)) {
				const chip = tasksContainer.createDiv({ cls: 'gantt-cal-task-chip' });
				chip.style.backgroundColor = getStatusColor(task.status, this.plugin.settings.statuses);
				chip.createSpan({ cls: 'gantt-cal-chip-title', text: task.title });
				chip.title = `${task.title} (${task.status})`;

				chip.onclick = (e) => {
					e.stopPropagation();
					new TaskModal(this.plugin.app, this.plugin, task).open();
				};
			}

			if (dayTasks.length > 4) {
				tasksContainer.createSpan({
					cls: 'gantt-cal-more',
					text: `+${dayTasks.length - 4} more`,
				});
			}

			curr = addDays(curr, 1);
		}
	}

	private getTasksForDate(d: Date): Task[] {
		const target = startOfDay(d);
		return this.tasks.filter((t) => {
			const start = t.startDate ? startOfDay(t.startDate) : (t.history[0]?.date ? startOfDay(t.history[0].date) : null);
			const end = t.endDate ? startOfDay(t.endDate) : (t.status.toLowerCase() === 'done' ? (t.history[t.history.length - 1]?.date ? startOfDay(t.history[t.history.length - 1]!.date) : start) : start);

			if (start && end) {
				return target >= start && target <= end;
			}
			if (start) {
				return isSameDay(target, start);
			}
			return false;
		});
	}
}
