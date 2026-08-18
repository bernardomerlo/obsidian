import { TFile } from 'obsidian';

export type ViewType = 'gantt' | 'table' | 'kanban' | 'calendar' | 'analytics';
export type GanttScale = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface HistoryEntry {
	rawDateStr: string;
	date: Date;
	formattedDate: string;
	status: string;
	note?: string;
	lineNumber?: number;
}

export interface StatusSegment {
	status: string;
	startDate: Date;
	endDate: Date;
	formattedStart: string;
	formattedEnd: string;
	durationDays: number;
	isCurrent: boolean;
	isRework: boolean;
	color?: string;
}

export interface Task {
	file: TFile;
	id: string; // filePath
	title: string;
	folder: string; // relative parent directory
	project: string; // project group display name (e.g. SEFAZ › Alpha › Agência Virtual)
	startDate: Date | null;
	endDate: Date | null;
	formattedStart: string;
	formattedEnd: string;
	status: string;
	tags: string[];
	priority: string;
	progress: number; // 0 to 100
	dependencies: string[]; // file paths or titles
	link?: string[];
	tarefa?: string[];
	tipo?: 'css' | 'pbi';
	bodyContent: string;
	rawContent: string;
	history: HistoryEntry[];
	segments: StatusSegment[];
	mtime: number;
	reworkCount: number;
	totalLeadTimeDays: number;
	currentStatusDays: number;
}

export interface FolderTreeNode {
	id: string;
	name: string;
	path: string;
	level: number;
	children: FolderTreeNode[];
	tasks: Task[];
	allTasks: Task[];
	startDate: Date | null;
	endDate: Date | null;
	formattedStart: string;
	formattedEnd: string;
	progress: number;
	completedCount: number;
	totalCount: number;
}

export type TreeRenderItem =
	| {
			type: 'folder';
			node: FolderTreeNode;
			id: string;
			level: number;
			isCollapsed: boolean;
	  }
	| {
			type: 'task';
			task: Task;
			id: string;
			level: number;
			folderNode?: FolderTreeNode;
	  };

export interface ProjectGroup {
	id: string; // folder path
	name: string; // full display name (e.g. SEFAZ › Alpha › Agência Virtual)
	parentBreadcrumb: string; // parent folders prefix (e.g. SEFAZ › Alpha › )
	leafName: string; // folder name (e.g. Agência Virtual)
	folderPath: string;
	tasks: Task[];
	isCollapsed: boolean;
	startDate: Date | null;
	endDate: Date | null;
	formattedStart: string;
	formattedEnd: string;
	progress: number;
	completedCount: number;
	totalCount: number;
}

export interface StatusConfig {
	id: string;
	name: string;
	color: string;
	isDone?: boolean;
	order?: number;
}

export interface GanttSettings {
	taskFolder: string;
	dateFormat: 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'MM-DD-YYYY';
	useWikilinksInHistory: boolean;
	defaultView: ViewType;
	defaultScale: GanttScale;
	showHistorySegmentsByDefault: boolean;
	groupByFolder: boolean;
	clickAction: 'open-note' | 'edit-modal';
	statuses: StatusConfig[];
	kanbanColumns: string[];
	autoSetDatesOnStatusChange: boolean;
	includeSubfolders: boolean;
	workdaysOnly: boolean;
	filterTags: string[];
}

export interface FilterOptions {
	searchQuery: string;
	selectedStatuses: string[];
	selectedTags: string[];
	folder: string;
	dateFrom: Date | null;
	dateTo: Date | null;
	showDone: boolean;
}

export interface StageDurationStats {
	status: string;
	color: string;
	totalDays: number;
	avgDays: number;
	taskCount: number;
}

export interface TaskAnalytics {
	totalTasks: number;
	completedTasks: number;
	inProgressTasks: number;
	avgLeadTimeDays: number;
	avgCycleTimeDays: number;
	totalReworkCount: number;
	reworkRatePercent: number;
	stageStats: StageDurationStats[];
	reworkTasks: Array<{ task: Task; reworkCount: number }>;
	recentTransitions: Array<{
		taskTitle: string;
		filePath: string;
		fromStatus?: string;
		toStatus: string;
		date: Date;
		formattedDate: string;
	}>;
}

export interface CodeblockConfig {
	folder?: string;
	tag?: string;
	tags?: string[];
	status?: string;
	statuses?: string[];
	view?: ViewType;
	scale?: GanttScale;
	showSegments?: boolean;
	groupByFolder?: boolean;
	title?: string;
	height?: string;
	hideToolbar?: boolean;
}
