import { TFile } from 'obsidian';
import { FolderTreeNode, HistoryEntry, ProjectGroup, StatusSegment, Task, TreeRenderItem } from '../types';
import { diffInDays, formatDate, parseDate, startOfDay } from '../utils/dateUtils';
import { getStatusColor, normalizeStatus } from '../utils/domUtils';

export class TaskParser {
	/**
	 * Parses a raw markdown file content into a Task object
	 */
	static parse(file: TFile, rawContent: string): Task {
		const { frontmatter, bodyAndHistory } = this.splitFrontmatter(rawContent);
		const { bodyContent, historyEntries } = this.extractBodyAndHistory(bodyAndHistory);

		// Extract frontmatter fields
		const startDate = parseDate(frontmatter['start'] || frontmatter['startDate'] || frontmatter['created']);
		const endDate = parseDate(frontmatter['end'] || frontmatter['endDate'] || frontmatter['due']);
		
		let status = (typeof frontmatter['status'] === 'string' ? frontmatter['status'] : '').trim();
		// If status is empty in frontmatter, but history has entries, use the latest history status
		if (!status && historyEntries.length > 0) {
			const last = historyEntries[historyEntries.length - 1];
			if (last) status = last.status;
		}
		if (!status) status = 'todo';

		const priority = (typeof frontmatter['priority'] === 'string' ? frontmatter['priority'] : 'normal').toLowerCase();
		
		let tags: string[] = [];
		if (Array.isArray(frontmatter['tags'])) {
			tags = frontmatter['tags'].map((t: unknown) => String(t).replace(/^#/, '').trim()).filter(Boolean);
		} else if (typeof frontmatter['tags'] === 'string') {
			tags = frontmatter['tags']
				.split(/[\s,]+/)
				.map((t: string) => t.replace(/^#/, '').trim())
				.filter(Boolean);
		}

		let progress = 0;
		if (typeof frontmatter['progress'] === 'number') {
			progress = frontmatter['progress'];
		} else if (typeof frontmatter['progress'] === 'string') {
			progress = parseInt(frontmatter['progress'], 10) || 0;
		} else {
			const stLower = normalizeStatus(status);
			if (stLower === 'done') {
				progress = 100;
			}
		}

		let dependencies: string[] = [];
		if (Array.isArray(frontmatter['dependencies'] || frontmatter['dependsOn'])) {
			const deps = (frontmatter['dependencies'] || frontmatter['dependsOn']) as unknown[];
			dependencies = deps.map((d) => String(d).trim()).filter(Boolean);
		}

		// Compute status segments and analytics
		const segments = this.buildStatusSegments(historyEntries, startDate, endDate, status);
		const reworkCount = this.calculateReworkCount(historyEntries);

		const stLower = normalizeStatus(status);
		const isDone = stLower === 'done';
		const today = startOfDay(new Date());

		const firstDate = (historyEntries.length > 0 && historyEntries[0] ? historyEntries[0].date : null) || startDate || new Date(file.stat.ctime);
		const lastDate = isDone 
			? (endDate || (historyEntries.length > 0 && historyEntries[historyEntries.length - 1] ? historyEntries[historyEntries.length - 1]!.date : null) || today)
			: today;
		const totalLeadTimeDays = Math.max(1, diffInDays(firstDate, lastDate) + 1);

		let currentStatusDays = 0;
		if (historyEntries.length > 0) {
			const lastEntry = historyEntries[historyEntries.length - 1];
			if (lastEntry) {
				currentStatusDays = Math.max(1, diffInDays(lastEntry.date, today) + (isDone ? 0 : 1));
			}
		}

		let link: string[] = [];
		if (Array.isArray(frontmatter['link'])) {
			link = frontmatter['link'].map((l: unknown) => String(l).trim()).filter(Boolean);
		} else if (typeof frontmatter['link'] === 'string') {
			link = [frontmatter['link'].trim()];
		}

		let tarefa: string[] = [];
		if (Array.isArray(frontmatter['tarefa'])) {
			tarefa = frontmatter['tarefa'].map((t: unknown) => String(t).trim()).filter(Boolean);
		} else if (typeof frontmatter['tarefa'] === 'string') {
			tarefa = [frontmatter['tarefa'].trim()];
		}

		const isCssType = file.basename.startsWith('CSS-') || tarefa.length > 0;
		const tipo: 'css' | 'pbi' = isCssType ? 'css' : 'pbi';

		const parentFolder = file.parent?.path || '';
		const folder = parentFolder === '/' ? '' : parentFolder;
		const project = folder ? folder.split('/').filter(Boolean).join(' › ') : 'General';

		return {
			file,
			id: file.path,
			title: file.basename,
			folder,
			project,
			startDate,
			endDate,
			formattedStart: startDate ? formatDate(startDate, 'DD-MM-YYYY') : '',
			formattedEnd: endDate ? formatDate(endDate, 'DD-MM-YYYY') : '',
			status,
			tags,
			priority,
			progress,
			dependencies,
			link,
			tarefa,
			tipo,
			bodyContent,
			rawContent,
			history: historyEntries,
			segments,
			mtime: file.stat.mtime,
			reworkCount,
			totalLeadTimeDays,
			currentStatusDays,
		};
	}

	/**
	 * Extracts frontmatter as Record<string, any> and the remaining text
	 */
	static splitFrontmatter(rawContent: string): { frontmatter: Record<string, unknown>; bodyAndHistory: string } {
		const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
		if (!match || !match[1]) {
			return { frontmatter: {}, bodyAndHistory: rawContent };
		}

		const yamlBlock = match[1];
		const bodyAndHistory = match[2] || '';
		const frontmatter: Record<string, unknown> = {};

		const lines = yamlBlock.split(/\r?\n/);
		let currentKey: string | null = null;
		let currentArray: string[] | null = null;

		for (const line of lines) {
			const arrayItemMatch = line.match(/^\s*-\s+(.*)$/);
			if (arrayItemMatch && currentKey) {
				if (!currentArray) {
					currentArray = [];
					frontmatter[currentKey] = currentArray;
				}
				const val = arrayItemMatch[1]?.trim() ?? '';
				currentArray.push(val.replace(/^['"](.*)['"]$/, '$1'));
				continue;
			}

			const keyValMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
			if (keyValMatch && keyValMatch[1]) {
				currentKey = keyValMatch[1].trim();
				currentArray = null;
				const rawVal = (keyValMatch[2] || '').trim();
				if (rawVal.length > 0) {
					// Clean quotes
					const cleaned = rawVal.replace(/^['"](.*)['"]$/, '$1');
					frontmatter[currentKey] = cleaned;
				}
			}
		}

		return { frontmatter, bodyAndHistory };
	}

	/**
	 * Separates the body content from the # History section
	 */
	static extractBodyAndHistory(bodyAndHistory: string): { bodyContent: string; historyEntries: HistoryEntry[] } {
		// Look for heading like # History or ## History (case-insensitive)
		const historyHeadingRegex = /^(#{1,6})\s+History\s*$/im;
		const match = bodyAndHistory.match(historyHeadingRegex);

		if (!match || match.index === undefined) {
			return {
				bodyContent: bodyAndHistory.trim(),
				historyEntries: [],
			};
		}

		const headingIndex = match.index;
		const headingText = match[0];
		const bodyContent = bodyAndHistory.substring(0, headingIndex).trim();
		const historySection = bodyAndHistory.substring(headingIndex + headingText.length);

		const historyEntries: HistoryEntry[] = [];
		const lines = historySection.split(/\r?\n/);

		// Stop parsing history if a new heading of same or higher level appears
		const headingLevel = (match[1] || '#').length;
		const nextHeadingRegex = new RegExp(`^#{1,${headingLevel}}\\s+`);

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? '';
			const trimmed = line.trim();
			if (!trimmed) continue;

			// If another heading starts, stop history list
			if (nextHeadingRegex.test(trimmed)) {
				break;
			}

			// Match lines like:
			// - [[01-08-2026]] - todo
			// - [[2026-08-01]] - dev
			// - 01-08-2026 - hom
			// - [01-08-2026] : dev
			// - [[01-08-2026]] : dev (notes)
			const entryMatch = trimmed.match(/^[-*+]\s+(?:\[\[([^\]]+)\]\]|([0-9/.-]+))\s*[-:]\s*(.+)$/);
			if (entryMatch) {
				const rawDate = (entryMatch[1] || entryMatch[2] || '').trim();
				const rawStatus = (entryMatch[3] || '').trim();
				const parsedD = parseDate(rawDate);

				if (parsedD && rawStatus) {
					historyEntries.push({
						rawDateStr: rawDate,
						date: parsedD,
						formattedDate: formatDate(parsedD, 'DD-MM-YYYY'),
						status: rawStatus,
						lineNumber: i,
					});
				}
			}
		}

		return {
			bodyContent,
			historyEntries,
		};
	}

	/**
	 * Constructs chronological StatusSegments from history entries
	 */
	static buildStatusSegments(
		history: HistoryEntry[],
		startDate: Date | null,
		endDate: Date | null,
		currentStatus: string
	): StatusSegment[] {
		const stLower = normalizeStatus(currentStatus);
		const isDone = stLower === 'done';
		const today = startOfDay(new Date());

		const effectiveStart = startDate ? startOfDay(startDate) : (history.length > 0 && history[0] ? history[0].date : today);
		const effectiveEnd = endDate 
			? startOfDay(endDate) 
			: (isDone ? (history.length > 0 && history[history.length - 1] ? history[history.length - 1]!.date : effectiveStart) : today);

		if (history.length === 0) {
			const start = effectiveStart;
			const end = effectiveEnd >= start ? effectiveEnd : start;
			return [
				{
					status: currentStatus,
					startDate: start,
					endDate: end,
					formattedStart: formatDate(start, 'DD-MM-YYYY'),
					formattedEnd: formatDate(end, 'DD-MM-YYYY'),
					durationDays: Math.max(1, diffInDays(start, end) + 1),
					isCurrent: true,
					isRework: false,
					color: getStatusColor(currentStatus),
				},
			];
		}

		// Sort history chronologically
		const sorted = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
		const segments: StatusSegment[] = [];
		const seenStatuses = new Set<string>();

		for (let i = 0; i < sorted.length; i++) {
			const entry = sorted[i]!;
			const nextEntry = sorted[i + 1];

			const segStart = i === 0 ? effectiveStart : entry.date;
			let segEnd: Date;

			if (nextEntry) {
				segEnd = nextEntry.date;
			} else {
				segEnd = effectiveEnd >= segStart ? effectiveEnd : segStart;
			}

			const normalizedStatus = normalizeStatus(entry.status);
			const isRework = seenStatuses.has(normalizedStatus) && normalizedStatus !== 'done';
			seenStatuses.add(normalizedStatus);

			const duration = nextEntry 
				? Math.max(1, diffInDays(segStart, segEnd))
				: Math.max(1, diffInDays(segStart, segEnd) + 1);

			segments.push({
				status: entry.status,
				startDate: segStart,
				endDate: segEnd,
				formattedStart: formatDate(segStart, 'DD-MM-YYYY'),
				formattedEnd: formatDate(segEnd, 'DD-MM-YYYY'),
				durationDays: duration,
				isCurrent: i === sorted.length - 1,
				isRework,
				color: getStatusColor(entry.status),
			});
		}

		return segments;
	}

	/**
	 * Detects how many times a status rebounded (e.g. hom -> dev -> hom)
	 */
	static calculateReworkCount(history: HistoryEntry[]): number {
		let reworks = 0;
		const seen = new Set<string>();
		for (const entry of history) {
			const st = entry.status.toLowerCase();
			if (seen.has(st) && st !== 'done' && st !== 'completed') {
				reworks++;
			}
			seen.add(st);
		}
		return reworks;
	}

	/**
	 * Adds or appends a status entry to the # History section and updates frontmatter
	 */
	static applyStatusTransition(
		rawContent: string,
		newStatus: string,
		dateStr: string,
		useWikilinks = true,
		newStartDate?: string,
		newEndDate?: string
	): string {
		// Update frontmatter status
		const frontmatterUpdates: Record<string, unknown> = { status: newStatus };
		if (newStartDate) frontmatterUpdates['start'] = newStartDate;
		if (newEndDate) frontmatterUpdates['end'] = newEndDate;

		let updated = this.updateFrontmatter(rawContent, frontmatterUpdates);

		// Format history line
		const historyLine = useWikilinks
			? `- [[${dateStr}]] - ${newStatus}`
			: `- ${dateStr} - ${newStatus}`;

		// Append to history section
		updated = this.appendHistoryLine(updated, historyLine);

		return updated;
	}

	/**
	 * Safely updates YAML frontmatter without breaking comments or formatting
	 */
	static updateFrontmatter(rawContent: string, updates: Record<string, unknown>): string {
		const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

		if (!match) {
			// No frontmatter yet, create one
			let yaml = '---\n';
			for (const [key, val] of Object.entries(updates)) {
				if (Array.isArray(val)) {
					yaml += `${key}:\n`;
					for (const item of val) {
						yaml += `  - ${item}\n`;
					}
				} else if (val !== undefined && val !== null) {
					const valStr = typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' ? String(val) : JSON.stringify(val);
					yaml += `${key}: ${valStr}\n`;
				}
			}
			yaml += '---\n\n';
			return yaml + rawContent;
		}

		let yamlBlock = match[1] || '';
		const rest = match[2] || '';

		for (const [key, val] of Object.entries(updates)) {
			if (val === undefined || val === null) continue;

			if (Array.isArray(val)) {
				const arrayRegex = new RegExp(`^${key}:[\\s\\S]*?(?=^[a-zA-Z0-9_-]+:|$)`, 'm');
				let arrayStr = `${key}:\n`;
				for (const item of val) {
					arrayStr += `  - ${item}\n`;
				}
				if (arrayRegex.test(yamlBlock)) {
					yamlBlock = yamlBlock.replace(arrayRegex, arrayStr.trimEnd() + '\n');
				} else {
					yamlBlock += `\n${arrayStr.trimEnd()}`;
				}
			} else {
				const valStr = typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' ? String(val) : JSON.stringify(val);
				const singleKeyRegex = new RegExp(`^${key}:.*$`, 'm');
				if (singleKeyRegex.test(yamlBlock)) {
					yamlBlock = yamlBlock.replace(singleKeyRegex, `${key}: ${valStr}`);
				} else {
					yamlBlock += `\n${key}: ${valStr}`;
				}
			}
		}

		return `---\n${yamlBlock.trim()}\n---\n${rest}`;
	}

	/**
	 * Appends a history line to the # History section, creating it if needed
	 */
	static appendHistoryLine(content: string, historyLine: string): string {
		const historyHeadingRegex = /^(#{1,6})\s+History\s*$/im;
		const match = content.match(historyHeadingRegex);

		if (!match || match.index === undefined) {
			// # History section does not exist, append at the end
			const trimmed = content.trimEnd();
			return `${trimmed}\n\n# History\n\n${historyLine}\n`;
		}

		const headingIndex = match.index;
		const headingText = match[0];
		const beforeSection = content.substring(0, headingIndex + headingText.length);
		const afterSection = content.substring(headingIndex + headingText.length);

		// Find the end of the history items
		const lines = afterSection.split(/\r?\n/);
		let insertIndex = lines.length;
		const headingLevel = (match[1] || '#').length;
		const nextHeadingRegex = new RegExp(`^#{1,${headingLevel}}\\s+`);

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i] ?? '';
			if (nextHeadingRegex.test(line.trim())) {
				insertIndex = i;
				break;
			}
		}

		// Insert before next heading or at the end of section
		const historyPart = lines.slice(0, insertIndex);
		const remainingPart = lines.slice(insertIndex);

		// Clean and append
		let historyLines = historyPart.join('\n').trimEnd();
		if (!historyLines) {
			historyLines = `\n\n${historyLine}`;
		} else {
			historyLines = `${historyLines}\n${historyLine}`;
		}

		const finalRemaining = remainingPart.length > 0 ? `\n\n${remainingPart.join('\n').trimStart()}` : '\n';
		return `${beforeSection}${historyLines}${finalRemaining}`;
	}

	/**
	 * Formats a clean template for a brand new task note matching the Templater schema
	 */
	static createNewTaskTemplate(data: {
		title: string;
		tipo?: 'css' | 'pbi';
		taskId?: string;
		projeto?: string;
		startDate?: string;
		endDate?: string;
		status?: string;
		tags?: string[];
		priority?: string;
		body?: string;
		initialHistoryDate?: string;
		useWikilinks?: boolean;
		link?: string[];
		tarefa?: string[];
		includeHistorySection?: boolean;
	}): string {
		const status = data.status || 'todo';
		const dateStr = data.initialHistoryDate || formatDate(new Date(), 'DD-MM-YYYY');
		const useWikilinks = data.useWikilinks !== false;

		let yaml = '---\n';
		yaml += `start: ${data.startDate ? data.startDate : ''}\n`;
		yaml += `end: ${data.endDate ? data.endDate : ''}\n`;
		yaml += `status: ${status}\n`;

		// link field
		if (data.projeto) {
			yaml += 'link:\n';
			yaml += `  - "[[${data.projeto}]]"\n`;
		} else if (data.link && data.link.length > 0) {
			yaml += 'link:\n';
			for (const l of data.link) {
				const clean = l.replace(/^\[\[(.*)\]\]$/, '$1');
				yaml += `  - "[[${clean}]]"\n`;
			}
		} else if (data.tipo !== 'css') {
			yaml += 'link:\n  -\n';
		}

		// tarefa field (for CSS tickets)
		const rawId = data.taskId || data.title.replace(/^CSS-/, '').trim();
		if (data.tipo === 'css' || data.title.startsWith('CSS-')) {
			yaml += 'tarefa:\n';
			yaml += `  - https://css.sefaz.es.gov.br/front/ticket.form.php?id=${rawId}\n`;
		} else if (data.tarefa && data.tarefa.length > 0) {
			yaml += 'tarefa:\n';
			for (const t of data.tarefa) {
				yaml += `  - ${t}\n`;
			}
		}

		if (data.priority && data.priority !== 'normal') yaml += `priority: ${data.priority}\n`;
		if (data.tags && data.tags.length > 0) {
			yaml += 'tags:\n';
			for (const t of data.tags) {
				yaml += `  - ${t}\n`;
			}
		}
		yaml += '---\n';

		const body = data.body ? `\n${data.body.trim()}\n` : '';

		let history = '';
		if (data.includeHistorySection || data.startDate) {
			const historyLine = useWikilinks ? `- [[${dateStr}]] - ${status}` : `- ${dateStr} - ${status}`;
			history = `\n# History\n\n${historyLine}\n`;
		}

		return `${yaml}${body}${history}`;
	}

	/**
	 * Groups tasks into ProjectGroup objects by their folder path
	 */
	static groupTasksByProject(tasks: Task[], baseFolder: string = ''): ProjectGroup[] {
		const groupsMap = new Map<string, Task[]>();

		for (const task of tasks) {
			const groupKey = task.folder || '';
			if (!groupsMap.has(groupKey)) {
				groupsMap.set(groupKey, []);
			}
			groupsMap.get(groupKey)!.push(task);
		}

		const groups: ProjectGroup[] = [];

		for (const [folderPath, groupTasks] of groupsMap.entries()) {
			let minStart: Date | null = null;
			let maxEnd: Date | null = null;
			let completed = 0;

			for (const t of groupTasks) {
				const start = t.startDate || (t.history[0]?.date) || null;
				const stLower = normalizeStatus(t.status);
				const isDone = stLower === 'done';
				const today = startOfDay(new Date());

				let end = t.endDate;
				if (!end) {
					if (isDone) {
						end = t.history.length > 0 && t.history[t.history.length - 1] ? t.history[t.history.length - 1]!.date : start;
					} else {
						end = today;
					}
				}

				if (start) {
					if (!minStart || start < minStart) minStart = start;
				}
				if (end) {
					if (!maxEnd || end > maxEnd) maxEnd = end;
				}
				if (isDone) {
					completed++;
				}
			}

			let displayName = folderPath;
			let parentBreadcrumb = '';
			let leafName = folderPath;

			if (!folderPath) {
				displayName = 'Default / Root';
				leafName = 'Default / Root';
				parentBreadcrumb = '';
			} else {
				let relPath = folderPath;
				if (baseFolder && relPath.startsWith(baseFolder + '/')) {
					relPath = relPath.substring(baseFolder.length + 1);
				}
				const parts = relPath.split('/').filter(Boolean);
				if (parts.length <= 1) {
					displayName = parts[0] || folderPath;
					leafName = displayName;
					parentBreadcrumb = '';
				} else {
					leafName = parts[parts.length - 1]!;
					parentBreadcrumb = parts.slice(0, -1).join(' › ') + ' › ';
					displayName = parts.join(' › ');
				}
			}

			const progress = groupTasks.length > 0 ? Math.round((completed / groupTasks.length) * 100) : 0;

			groups.push({
				id: folderPath || 'root',
				name: displayName,
				parentBreadcrumb,
				leafName,
				folderPath,
				tasks: groupTasks,
				isCollapsed: false,
				startDate: minStart,
				endDate: maxEnd,
				formattedStart: minStart ? formatDate(minStart, 'DD-MM-YYYY') : '',
				formattedEnd: maxEnd ? formatDate(maxEnd, 'DD-MM-YYYY') : '',
				progress,
				completedCount: completed,
				totalCount: groupTasks.length,
			});
		}

		return groups.sort((a, b) => a.folderPath.localeCompare(b.folderPath));
	}

	/**
	 * Builds a nested FolderTreeNode hierarchy from tasks
	 */
	static buildFolderTree(tasks: Task[], baseFolder: string = ''): FolderTreeNode[] {
		// Map of normalized folder path -> tasks directly in this folder
		const directTasksMap = new Map<string, Task[]>();

		for (const task of tasks) {
			let folder = task.folder || '';
			if (baseFolder && folder.startsWith(baseFolder + '/')) {
				folder = folder.substring(baseFolder.length + 1);
			} else if (baseFolder && folder === baseFolder) {
				folder = '';
			}
			if (!directTasksMap.has(folder)) {
				directTasksMap.set(folder, []);
			}
			directTasksMap.get(folder)!.push(task);
		}

		// Collect all unique folder paths and intermediate parent paths
		const allPaths = new Set<string>();
		for (const folder of directTasksMap.keys()) {
			if (!folder) continue;
			const parts = folder.split('/').filter(Boolean);
			let curr = '';
			for (const part of parts) {
				curr = curr ? `${curr}/${part}` : part;
				allPaths.add(curr);
			}
		}

		// Node cache map
		const nodeMap = new Map<string, FolderTreeNode>();

		// Create root/general node if there are direct tasks with no folder
		if (directTasksMap.has('')) {
			const rootTasks = directTasksMap.get('')!;
			nodeMap.set('', {
				id: 'root',
				name: 'Root / General',
				path: '',
				level: 0,
				children: [],
				tasks: rootTasks,
				allTasks: [...rootTasks],
				startDate: null,
				endDate: null,
				formattedStart: '',
				formattedEnd: '',
				progress: 0,
				completedCount: 0,
				totalCount: rootTasks.length,
			});
		}

		// Create all folder nodes
		for (const p of Array.from(allPaths).sort()) {
			const parts = p.split('/');
			const name = parts[parts.length - 1] || p;
			const level = parts.length - 1;
			const direct = directTasksMap.get(p) || [];

			nodeMap.set(p, {
				id: p,
				name,
				path: p,
				level,
				children: [],
				tasks: direct,
				allTasks: [...direct],
				startDate: null,
				endDate: null,
				formattedStart: '',
				formattedEnd: '',
				progress: 0,
				completedCount: 0,
				totalCount: direct.length,
			});
		}

		// Link parents and children
		const rootNodes: FolderTreeNode[] = [];
		if (nodeMap.has('')) {
			rootNodes.push(nodeMap.get('')!);
		}

		for (const [p, node] of nodeMap.entries()) {
			if (p === '') continue;

			const parts = p.split('/');
			if (parts.length === 1) {
				// Top-level root node
				rootNodes.push(node);
			} else {
				// Find parent
				const parentPath = parts.slice(0, -1).join('/');
				const parentNode = nodeMap.get(parentPath);
				if (parentNode) {
					parentNode.children.push(node);
				} else {
					rootNodes.push(node);
				}
			}
		}

		// Recursive rollup: allTasks, start/end dates, progress
		function rollupNode(node: FolderTreeNode): void {
			for (const child of node.children) {
				rollupNode(child);
				node.allTasks.push(...child.allTasks);
			}

			let minStart: Date | null = null;
			let maxEnd: Date | null = null;
			let completed = 0;

			for (const t of node.allTasks) {
				const start = t.startDate || (t.history[0]?.date) || null;
				const stLower = normalizeStatus(t.status);
				const isDone = stLower === 'done';
				const today = startOfDay(new Date());

				let end = t.endDate;
				if (!end) {
					if (isDone) {
						end = t.history.length > 0 && t.history[t.history.length - 1] ? t.history[t.history.length - 1]!.date : start;
					} else {
						end = today;
					}
				}

				if (start) {
					if (!minStart || start < minStart) minStart = start;
				}
				if (end) {
					if (!maxEnd || end > maxEnd) maxEnd = end;
				}
				if (isDone) {
					completed++;
				}
			}

			node.startDate = minStart;
			node.endDate = maxEnd;
			node.formattedStart = minStart ? formatDate(minStart, 'DD-MM-YYYY') : '';
			node.formattedEnd = maxEnd ? formatDate(maxEnd, 'DD-MM-YYYY') : '';
			node.completedCount = completed;
			node.totalCount = node.allTasks.length;
			node.progress = node.allTasks.length > 0 ? Math.round((completed / node.allTasks.length) * 100) : 0;

			// Sort children alphabetically
			node.children.sort((a: FolderTreeNode, b: FolderTreeNode) => a.name.localeCompare(b.name));
		}

		for (const root of rootNodes) {
			rollupNode(root);
		}

		return rootNodes.sort((a: FolderTreeNode, b: FolderTreeNode) => a.name.localeCompare(b.name));
	}

	/**
	 * Flattens the visible nodes of the folder tree into an array of TreeRenderItem
	 */
	static flattenVisibleTree(
		nodes: FolderTreeNode[],
		collapsedSet: Set<string>,
		result: TreeRenderItem[] = []
	): TreeRenderItem[] {
		for (const node of nodes) {
			const isCollapsed = collapsedSet.has(node.id);

			// Add folder row
			result.push({
				type: 'folder',
				node,
				id: node.id,
				level: node.level,
				isCollapsed,
			});

			if (!isCollapsed) {
				// 1. Subfolders
				if (node.children.length > 0) {
					this.flattenVisibleTree(node.children, collapsedSet, result);
				}

				// 2. Direct tasks inside this folder
				for (const task of node.tasks) {
					result.push({
						type: 'task',
						task,
						id: task.id,
						level: node.level + 1,
						folderNode: node,
					});
				}
			}
		}
		return result;
	}
}
