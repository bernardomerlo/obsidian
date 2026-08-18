import { StageDurationStats, Task, TaskAnalytics } from '../types';
import { formatDate } from '../utils/dateUtils';
import { getStatusColor } from '../utils/domUtils';

export class AnalyticsService {
	static calculateAnalytics(tasks: Task[]): TaskAnalytics {
		const totalTasks = tasks.length;
		let completedTasks = 0;
		let inProgressTasks = 0;
		let totalLeadTime = 0;
		let leadTimeTaskCount = 0;
		let totalReworkCount = 0;

		const stageMap = new Map<string, { totalDays: number; taskCount: number }>();
		const reworkTasks: Array<{ task: Task; reworkCount: number }> = [];
		const recentTransitions: TaskAnalytics['recentTransitions'] = [];

		for (const task of tasks) {
			const st = task.status.toLowerCase();
			const isDone = st === 'done' || st === 'completed' || st === 'closed';

			if (isDone) {
				completedTasks++;
				if (task.totalLeadTimeDays > 0) {
					totalLeadTime += task.totalLeadTimeDays;
					leadTimeTaskCount++;
				}
			} else {
				inProgressTasks++;
			}

			if (task.reworkCount > 0) {
				totalReworkCount += task.reworkCount;
				reworkTasks.push({ task, reworkCount: task.reworkCount });
			}

			// Stage duration accumulation from segments
			for (const seg of task.segments) {
				const segStatus = seg.status;
				const current = stageMap.get(segStatus) || { totalDays: 0, taskCount: 0 };
				current.totalDays += seg.durationDays;
				current.taskCount += 1;
				stageMap.set(segStatus, current);
			}

			// Add history transitions to recent transitions
			for (let i = 0; i < task.history.length; i++) {
				const entry = task.history[i]!;
				const prevEntry = i > 0 ? task.history[i - 1] : undefined;
				recentTransitions.push({
					taskTitle: task.title,
					filePath: task.file.path,
					fromStatus: prevEntry?.status,
					toStatus: entry.status,
					date: entry.date,
					formattedDate: formatDate(entry.date, 'DD-MM-YYYY'),
				});
			}
		}

		// Sort transitions newest first
		recentTransitions.sort((a, b) => b.date.getTime() - a.date.getTime());

		// Sort rework tasks highest rework first
		reworkTasks.sort((a, b) => b.reworkCount - a.reworkCount);

		const stageStats: StageDurationStats[] = Array.from(stageMap.entries()).map(([status, data]) => ({
			status,
			color: getStatusColor(status),
			totalDays: data.totalDays,
			avgDays: Math.round((data.totalDays / Math.max(1, data.taskCount)) * 10) / 10,
			taskCount: data.taskCount,
		}));

		const avgLeadTimeDays = leadTimeTaskCount > 0 ? Math.round((totalLeadTime / leadTimeTaskCount) * 10) / 10 : 0;
		const avgCycleTimeDays = stageStats.reduce((acc, s) => acc + s.avgDays, 0);
		const reworkRatePercent = totalTasks > 0 ? Math.round((reworkTasks.length / totalTasks) * 100) : 0;

		return {
			totalTasks,
			completedTasks,
			inProgressTasks,
			avgLeadTimeDays,
			avgCycleTimeDays,
			totalReworkCount,
			reworkRatePercent,
			stageStats,
			reworkTasks,
			recentTransitions: recentTransitions.slice(0, 30), // latest 30
		};
	}
}
