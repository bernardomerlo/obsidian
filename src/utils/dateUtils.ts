import { GanttScale } from '../types';

/**
 * Parses various date formats safely without UTC/local timezone shifts
 */
export function parseDate(value: unknown): Date | null {
	if (!value) return null;
	if (value instanceof Date) {
		return isNaN(value.getTime()) ? null : startOfDay(value);
	}

	let str = String(value).trim();
	// Remove wikilink brackets if present [[01-08-2026]] -> 01-08-2026
	str = str.replace(/^\[\[(.*?)\]\]$/, '$1').trim();

	if (!str) return null;

	// Check for DD-MM-YYYY or DD/MM/YYYY
	const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
	if (dmyMatch && dmyMatch[1] && dmyMatch[2] && dmyMatch[3]) {
		const day = parseInt(dmyMatch[1], 10);
		const month = parseInt(dmyMatch[2], 10);
		const year = parseInt(dmyMatch[3], 10);
		if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
			return new Date(year, month - 1, day, 0, 0, 0, 0);
		}
	}

	// Check for YYYY-MM-DD or YYYY/MM/DD
	const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
	if (ymdMatch && ymdMatch[1] && ymdMatch[2] && ymdMatch[3]) {
		const year = parseInt(ymdMatch[1], 10);
		const month = parseInt(ymdMatch[2], 10);
		const day = parseInt(ymdMatch[3], 10);
		if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
			return new Date(year, month - 1, day, 0, 0, 0, 0);
		}
	}

	// Fallback to Date.parse
	const timestamp = Date.parse(str);
	if (!isNaN(timestamp)) {
		const d = new Date(timestamp);
		return startOfDay(d);
	}

	return null;
}

export function formatDate(
	date: Date | null,
	format: 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'MM-DD-YYYY' = 'DD-MM-YYYY'
): string {
	if (!date || isNaN(date.getTime())) return '';
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const year = String(date.getFullYear());

	switch (format) {
		case 'YYYY-MM-DD':
			return `${year}-${month}-${day}`;
		case 'MM-DD-YYYY':
			return `${month}-${day}-${year}`;
		case 'DD-MM-YYYY':
		default:
			return `${day}-${month}-${year}`;
	}
}

export function formatDisplayDate(date: Date | null): string {
	if (!date || isNaN(date.getTime())) return '-';
	const day = String(date.getDate()).padStart(2, '0');
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const month = months[date.getMonth()] ?? '';
	const year = date.getFullYear();
	return `${day} ${month} ${year}`;
}

export function formatShortDate(date: Date | null): string {
	if (!date || isNaN(date.getTime())) return '-';
	const day = String(date.getDate()).padStart(2, '0');
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const month = months[date.getMonth()] ?? '';
	return `${day} ${month}`;
}

export function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function addDays(d: Date, days: number): Date {
	const res = new Date(d.getTime());
	res.setDate(res.getDate() + days);
	return startOfDay(res);
}

export function diffInDays(d1: Date, d2: Date): number {
	const start = startOfDay(d1).getTime();
	const end = startOfDay(d2).getTime();
	const diff = (end - start) / (1000 * 60 * 60 * 24);
	return Math.round(diff);
}

export function isSameDay(d1: Date | null, d2: Date | null): boolean {
	if (!d1 || !d2) return false;
	return (
		d1.getFullYear() === d2.getFullYear() &&
		d1.getMonth() === d2.getMonth() &&
		d1.getDate() === d2.getDate()
	);
}

export function isToday(d: Date | null): boolean {
	if (!d) return false;
	return isSameDay(d, new Date());
}

export function startOfWeek(d: Date, startOnMonday = true): Date {
	const date = startOfDay(d);
	const day = date.getDay(); // 0 is Sunday
	const diff = date.getDate() - day + (startOnMonday ? (day === 0 ? -6 : 1) : 0);
	return new Date(date.setDate(diff));
}

export function endOfWeek(d: Date, startOnMonday = true): Date {
	const start = startOfWeek(d, startOnMonday);
	return addDays(start, 6);
}

export function startOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export interface TimelineColumn {
	date: Date;
	label: string;
	subLabel?: string;
	isToday: boolean;
	isWeekend: boolean;
	width: number;
}

export interface TimelineHeaderGroup {
	label: string;
	startIndex: number;
	span: number;
}

export function generateTimelineColumns(
	start: Date,
	end: Date,
	scale: GanttScale
): { columns: TimelineColumn[]; groups: TimelineHeaderGroup[] } {
	const columns: TimelineColumn[] = [];
	const groups: TimelineHeaderGroup[] = [];
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const daysShort = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

	const safeStart = startOfDay(start);
	const safeEnd = startOfDay(end);

	if (scale === 'day') {
		let current = new Date(safeStart.getTime());
		let currentMonth = -1;
		let groupStartIndex = 0;
		let currentGroupLabel = '';

		while (current <= safeEnd) {
			const d = new Date(current.getTime());
			const isWk = d.getDay() === 0 || d.getDay() === 6;
			const colWidth = 36;

			columns.push({
				date: d,
				label: `${d.getDate()}`,
				subLabel: daysShort[d.getDay()],
				isToday: isToday(d),
				isWeekend: isWk,
				width: colWidth,
			});

			const m = d.getMonth();
			const y = d.getFullYear();
			const monthLabel = `${months[m]} ${y}`;

			if (m !== currentMonth) {
				if (currentMonth !== -1) {
					groups.push({
						label: currentGroupLabel,
						startIndex: groupStartIndex,
						span: columns.length - 1 - groupStartIndex,
					});
				}
				currentMonth = m;
				groupStartIndex = columns.length - 1;
				currentGroupLabel = monthLabel;
			}

			current = addDays(current, 1);
		}

		if (columns.length > groupStartIndex) {
			groups.push({
				label: currentGroupLabel,
				startIndex: groupStartIndex,
				span: columns.length - groupStartIndex,
			});
		}
	} else if (scale === 'week') {
		let current = startOfWeek(safeStart);
		const weekEndLimit = endOfWeek(safeEnd);
		let currentMonth = -1;
		let groupStartIndex = 0;
		let currentGroupLabel = '';

		while (current <= weekEndLimit) {
			const weekStart = new Date(current.getTime());
			const weekEnd = addDays(weekStart, 6);
			const colWidth = 60;

			columns.push({
				date: weekStart,
				label: `W${getWeekNumber(weekStart)}`,
				subLabel: `${weekStart.getDate()} - ${weekEnd.getDate()} ${months[weekEnd.getMonth()]}`,
				isToday: isToday(weekStart) || (new Date() >= weekStart && new Date() <= weekEnd),
				isWeekend: false,
				width: colWidth,
			});

			const m = weekStart.getMonth();
			const y = weekStart.getFullYear();
			const monthLabel = `${months[m]} ${y}`;

			if (m !== currentMonth) {
				if (currentMonth !== -1) {
					groups.push({
						label: currentGroupLabel,
						startIndex: groupStartIndex,
						span: columns.length - 1 - groupStartIndex,
					});
				}
				currentMonth = m;
				groupStartIndex = columns.length - 1;
				currentGroupLabel = monthLabel;
			}

			current = addDays(current, 7);
		}

		if (columns.length > groupStartIndex) {
			groups.push({
				label: currentGroupLabel,
				startIndex: groupStartIndex,
				span: columns.length - groupStartIndex,
			});
		}
	} else if (scale === 'month' || scale === 'quarter' || scale === 'year') {
		let current = startOfMonth(safeStart);
		const monthEndLimit = endOfMonth(safeEnd);
		let currentYear = -1;
		let groupStartIndex = 0;
		let currentGroupLabel = '';

		while (current <= monthEndLimit) {
			const mStart = new Date(current.getTime());
			const colWidth = 70;
			const m = mStart.getMonth();
			const y = mStart.getFullYear();

			columns.push({
				date: mStart,
				label: months[m] ?? '',
				subLabel: `${y}`,
				isToday: new Date().getFullYear() === y && new Date().getMonth() === m,
				isWeekend: false,
				width: colWidth,
			});

			if (y !== currentYear) {
				if (currentYear !== -1) {
					groups.push({
						label: currentGroupLabel,
						startIndex: groupStartIndex,
						span: columns.length - 1 - groupStartIndex,
					});
				}
				currentYear = y;
				groupStartIndex = columns.length - 1;
				currentGroupLabel = `${y}`;
			}

			current = new Date(y, m + 1, 1);
		}

		if (columns.length > groupStartIndex) {
			groups.push({
				label: currentGroupLabel,
				startIndex: groupStartIndex,
				span: columns.length - groupStartIndex,
			});
		}
	}

	return { columns, groups };
}

export function getWeekNumber(d: Date): number {
	const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	const dayNum = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
