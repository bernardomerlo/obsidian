import { App, Modal, Notice, Setting, TFolder } from 'obsidian';
import type GanttPlugin from '../../main';
import { TaskParser } from '../../parser/TaskParser';
import { HistoryEntry, Task } from '../../types';
import { diffInDays, formatDate, formatDisplayDate, parseDate } from '../../utils/dateUtils';
import { createStatusBadge, getStatusColor } from '../../utils/domUtils';

export interface TaskModalOptions {
	initialStatus?: string;
	initialStartDate?: Date | null;
	initialFolder?: string;
}

export class TaskModal extends Modal {
	plugin: GanttPlugin;
	task?: Task;
	isNew: boolean;

	// Form fields
	private title: string = '';
	private tipo: 'css' | 'pbi' = 'css';
	private taskId: string = '';
	private projeto: string = 'Agência Virtual';
	private folder: string = '';
	private startDate: Date | null = null;
	private endDate: Date | null = null;
	private status: string = 'todo';
	private tags: string[] = [];
	private link: string[] = [];
	private tarefa: string[] = [];
	private priority: string = 'normal';
	private bodyContent: string = '';
	private history: HistoryEntry[] = [];

	private folderInputEl: any = null;

	constructor(app: App, plugin: GanttPlugin, task?: Task, options?: TaskModalOptions) {
		super(app);
		this.plugin = plugin;
		this.task = task;
		this.isNew = !task;

		if (task) {
			this.title = task.title;
			this.tipo = task.tipo || (task.title.startsWith('CSS-') ? 'css' : 'pbi');
			this.folder = task.file.parent?.path || '';
			this.startDate = task.startDate;
			this.endDate = task.endDate;
			this.status = task.status;
			this.tags = [...task.tags];
			this.link = task.link ? [...task.link] : [];
			this.tarefa = task.tarefa ? [...task.tarefa] : [];
			this.priority = task.priority;
			this.bodyContent = task.bodyContent;
			this.history = JSON.parse(JSON.stringify(task.history));
		} else {
			this.folder = options?.initialFolder || this.plugin.settings.taskFolder || '';
			this.startDate = options?.initialStartDate || null;
			this.status = options?.initialStatus || 'todo';
			this.history = [];
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('gantt-task-modal');

		contentEl.createEl('h2', {
			text: this.isNew ? 'Create New Task' : `Edit Task: ${this.task?.title}`,
		});

		if (this.isNew) {
			// Tipo (CSS or PBI / Task)
			new Setting(contentEl)
				.setName('Tipo')
				.setDesc('Selecione o tipo de tarefa')
				.addDropdown((dropdown) => {
					dropdown.addOption('css', 'CSS');
					dropdown.addOption('pbi', 'PBI / Task');
					dropdown.setValue(this.tipo);
					dropdown.onChange((val: string) => {
						this.tipo = val as 'css' | 'pbi';
						updatePlaceholder();
					});
				});

			// Task ID / Number / Name
			const idSetting = new Setting(contentEl)
				.setName('Número ou nome da tarefa')
				.setDesc('Digite o número ou nome da tarefa');

			let idInput: HTMLInputElement | null = null;
			idSetting.addText((text) => {
				idInput = text.inputEl;
				text.setPlaceholder('ex: 221611')
					.setValue(this.taskId)
					.onChange((val) => {
						this.taskId = val.trim();
						this.title = this.tipo === 'css' && !this.taskId.startsWith('CSS-') ? `CSS-${this.taskId}` : this.taskId;
					});
			});

			const updatePlaceholder = () => {
				if (idInput) {
					idInput.placeholder = this.tipo === 'css' ? 'ex: 221611' : 'ex: BG-8564d';
				}
				if (this.taskId) {
					this.title = this.tipo === 'css' && !this.taskId.startsWith('CSS-') ? `CSS-${this.taskId}` : this.taskId;
				}
			};

			// Projeto Dropdown matching Templater
			const opcoesProjetos = [
				'Agência Virtual',
				'Auto de Infração',
				'Aviso de Cobrança',
				'Cooperação Fiscal',
				'Mala Direta - Dte',
				'PAF-e',
			];

			const vaultFolders: string[] = [];
			const collectFolders = (f: TFolder) => {
				for (const child of f.children) {
					if (child instanceof TFolder) {
						vaultFolders.push(child.name);
						collectFolders(child);
					}
				}
			};
			collectFolders(this.app.vault.getRoot());
			const allProjects = Array.from(new Set([...opcoesProjetos, ...vaultFolders])).filter(Boolean);

			new Setting(contentEl)
				.setName('Projeto')
				.setDesc('Selecione o projeto vinculado (link: [[Projeto]])')
				.addDropdown((dropdown) => {
					for (const p of allProjects) {
						dropdown.addOption(p, p);
					}
					dropdown.setValue(this.projeto);
					dropdown.onChange((val) => {
						this.projeto = val;
						this.autoSelectFolderForProject(val);
					});
				});

			// Target Folder Setting
			new Setting(contentEl)
				.setName('Pasta de destino')
				.setDesc('Pasta onde a nota será criada no vault')
				.addText((text) => {
					this.folderInputEl = text;
					text.setPlaceholder('ex: SEFAZ/Alpha/Agência Virtual')
						.setValue(this.folder)
						.onChange((val) => {
							this.folder = val;
						});
				});

			this.autoSelectFolderForProject(this.projeto);
		} else {
			// Title for existing task
			new Setting(contentEl).setName('Title').addText((text) =>
				text
					.setPlaceholder('Task title')
					.setValue(this.title)
					.onChange((val) => {
						this.title = val;
					})
			);
		}

		// Status Dropdown
		new Setting(contentEl).setName('Status').addDropdown((dropdown) => {
			const statuses = this.plugin.settings.statuses;
			const currentLower = (this.status || 'todo').toLowerCase();

			let found = false;
			for (const s of statuses) {
				dropdown.addOption(s.id, s.name);
				if (s.id.toLowerCase() === currentLower || s.name.toLowerCase() === currentLower) {
					found = true;
				}
			}

			if (!found && this.status) {
				dropdown.addOption(this.status, this.status);
			}

			// Find matching key
			const matchKey =
				statuses.find(
					(s) => s.id.toLowerCase() === currentLower || s.name.toLowerCase() === currentLower
				)?.id || this.status;

			dropdown.setValue(matchKey);
			dropdown.onChange((val) => {
				const oldStatus = this.status;
				const statusObj = statuses.find((s) => s.id === val);
				this.status = statusObj ? statusObj.name : val;

				if (this.status !== oldStatus && !this.isNew) {
					this.history.push({
						rawDateStr: formatDate(new Date(), this.plugin.settings.dateFormat),
						date: new Date(),
						formattedDate: formatDate(new Date(), this.plugin.settings.dateFormat),
						status: this.status,
					});
					this.renderHistorySection(historyContainer);
				}
			});
		});

		// Start and End Date
		const dateRow = contentEl.createDiv({ cls: 'gantt-modal-date-row' });
		new Setting(dateRow).setName('Start Date').addText((text) => {
			text.inputEl.type = 'date';
			text.setValue(this.startDate ? formatDate(this.startDate, 'YYYY-MM-DD') : '');
			text.onChange((val) => {
				this.startDate = parseDate(val);
			});
		});

		new Setting(dateRow).setName('End Date').addText((text) => {
			text.inputEl.type = 'date';
			text.setValue(this.endDate ? formatDate(this.endDate, 'YYYY-MM-DD') : '');
			text.onChange((val) => {
				this.endDate = parseDate(val);
			});
		});

		new Setting(contentEl).setName('Tags').addText((text) =>
			text
				.setPlaceholder('backend, auth (comma separated)')
				.setValue(this.tags.join(', '))
				.onChange((val) => {
					this.tags = val
						.split(/[,]+/)
						.map((t) => t.trim().replace(/^#/, ''))
						.filter(Boolean);
				})
		);

		// Note Body content
		new Setting(contentEl)
			.setName('Note body')
			.setDesc('Markdown content before # History');

		const bodyTextArea = contentEl.createEl('textarea', {
			cls: 'gantt-modal-body-textarea',
			attr: { rows: '4', placeholder: 'Task description, checklists, notes...' },
		});
		bodyTextArea.value = this.bodyContent;
		bodyTextArea.addEventListener('input', () => {
			this.bodyContent = bodyTextArea.value;
		});

		// Status History Section
		contentEl.createEl('h3', { text: 'Status History (# History)' });
		const historyContainer = contentEl.createDiv({ cls: 'gantt-modal-history-container' });
		this.renderHistorySection(historyContainer);

		// Action Buttons
		const footer = contentEl.createDiv({ cls: 'gantt-modal-footer' });

		if (this.task) {
			const openNoteBtn = footer.createEl('button', {
				cls: 'mod-secondary',
				text: 'Open Note',
			});
			openNoteBtn.onclick = () => {
				if (this.task) {
					this.app.workspace.getLeaf(false).openFile(this.task.file);
					this.close();
				}
			};
		}

		const saveBtn = footer.createEl('button', {
			cls: 'mod-cta',
			text: this.isNew ? 'Create Task' : 'Save Changes',
		});
		saveBtn.onclick = async () => {
			await this.saveTask();
			this.close();
		};
	}

	private renderHistorySection(container: HTMLElement): void {
		container.empty();

		if (this.history.length === 0) {
			container.createDiv({
				cls: 'gantt-empty-history',
				text: 'No history entries yet.',
			});
		} else {
			const timeline = container.createDiv({ cls: 'gantt-modal-timeline' });

			for (let i = 0; i < this.history.length; i++) {
				const item = this.history[i]!;
				const prevItem = i > 0 ? this.history[i - 1] : undefined;
				const daysSincePrev = prevItem ? diffInDays(prevItem.date, item.date) : 0;

				const row = timeline.createDiv({ cls: 'gantt-timeline-row' });

				// Dot and line
				const dot = row.createDiv({ cls: 'gantt-timeline-dot' });
				dot.style.backgroundColor = getStatusColor(item.status, this.plugin.settings.statuses);

				// Date input
				const dateInput = row.createEl('input', {
					cls: 'gantt-timeline-date-input',
					type: 'date',
				});
				dateInput.value = formatDate(item.date, 'YYYY-MM-DD');
				dateInput.onchange = () => {
					const newD = parseDate(dateInput.value);
					if (newD) {
						item.date = newD;
						item.formattedDate = formatDate(newD, this.plugin.settings.dateFormat);
						this.renderHistorySection(container);
					}
				};

				// Status badge / input
				const statusSelect = row.createEl('select', { cls: 'gantt-timeline-status-select' });
				for (const s of this.plugin.settings.statuses) {
					const opt = statusSelect.createEl('option', { value: s.name, text: s.name });
					if (s.name.toLowerCase() === item.status.toLowerCase() || s.id.toLowerCase() === item.status.toLowerCase()) {
						opt.selected = true;
					}
				}
				if (!this.plugin.settings.statuses.some(s => s.name.toLowerCase() === item.status.toLowerCase())) {
					const opt = statusSelect.createEl('option', { value: item.status, text: item.status });
					opt.selected = true;
				}

				statusSelect.onchange = () => {
					item.status = statusSelect.value;
					if (i === this.history.length - 1) {
						this.status = item.status;
					}
					this.renderHistorySection(container);
				};

				// Elapsed days indicator
				if (prevItem) {
					row.createSpan({
						cls: 'gantt-timeline-elapsed',
						text: `+${daysSincePrev}d`,
					});
				}

				// Delete entry button
				const delBtn = row.createEl('button', {
					cls: 'gantt-timeline-del-btn',
					text: '✕',
				});
				delBtn.onclick = () => {
					this.history.splice(i, 1);
					this.renderHistorySection(container);
				};
			}
		}

		// Add entry button
		const addBtn = container.createEl('button', {
			cls: 'gantt-add-history-btn',
			text: '+ Add History Transition',
		});
		addBtn.onclick = () => {
			const initialStatus = this.plugin.settings.statuses[1]?.name || 'dev';
			this.history.push({
				rawDateStr: formatDate(new Date(), this.plugin.settings.dateFormat),
				date: new Date(),
				formattedDate: formatDate(new Date(), this.plugin.settings.dateFormat),
				status: initialStatus,
			});
			this.renderHistorySection(container);
		};
	}

	private autoSelectFolderForProject(projName: string): void {
		const files = this.app.vault.getAllLoadedFiles();
		for (const f of files) {
			if (f instanceof TFolder && f.name.toLowerCase() === projName.toLowerCase()) {
				this.folder = f.path;
				if (this.folderInputEl) {
					this.folderInputEl.setValue(this.folder);
				}
				return;
			}
		}
		if (this.plugin.settings.taskFolder) {
			this.folder = `${this.plugin.settings.taskFolder}/${projName}`;
		} else {
			this.folder = projName;
		}
		if (this.folderInputEl) {
			this.folderInputEl.setValue(this.folder);
		}
	}

	private async saveTask(): Promise<void> {
		if (this.isNew) {
			const cleanId = this.taskId.trim() || this.title.trim() || 'Tarefa';
			const finalTitle =
				this.tipo === 'css' && !cleanId.startsWith('CSS-') ? `CSS-${cleanId}` : cleanId;

			await this.plugin.taskManager.createTask({
				title: finalTitle,
				tipo: this.tipo,
				taskId: cleanId,
				projeto: this.projeto,
				folder: this.folder,
				startDate: this.startDate,
				endDate: this.endDate,
				status: this.status,
				tags: this.tags,
				priority: this.priority,
				body: this.bodyContent,
				link: this.projeto ? [`[[${this.projeto}]]`] : undefined,
				tarefa:
					this.tipo === 'css'
						? [`https://css.sefaz.es.gov.br/front/ticket.form.php?id=${cleanId}`]
						: undefined,
			});
		} else if (this.task) {
			const file = this.task.file;

			// Handle rename if title changed
			if (this.title.trim() !== this.task.title) {
				const parentPath = file.parent && file.parent.path !== '/' ? file.parent.path : '';
				const cleanTitle = this.title.replace(/[\\/:*?"<>|]/g, '-').trim();
				const newPath = parentPath ? `${parentPath}/${cleanTitle}.md` : `${cleanTitle}.md`;
				if (newPath !== file.path) {
					await this.app.fileManager.renameFile(file, newPath);
				}
			}

			const startDateStr = this.startDate ? formatDate(this.startDate, this.plugin.settings.dateFormat) : '';
			const endDateStr = this.endDate ? formatDate(this.endDate, this.plugin.settings.dateFormat) : '';

			// Read current raw file content
			const rawContent = await this.app.vault.read(file);
			const { frontmatter } = TaskParser.splitFrontmatter(rawContent);

			// Merge updated frontmatter fields
			const updatedFm: Record<string, any> = {
				...frontmatter,
				start: startDateStr || undefined,
				end: endDateStr || undefined,
				status: this.status,
				priority: this.priority && this.priority !== 'normal' ? this.priority : undefined,
				tags: this.tags.length > 0 ? this.tags : undefined,
			};

			if (this.task.link) updatedFm['link'] = this.task.link;
			if (this.task.tarefa) updatedFm['tarefa'] = this.task.tarefa;

			// Build history lines
			let historyMarkdown = '';
			if (this.history.length > 0) {
				const useWikilinks = this.plugin.settings.useWikilinksInHistory;
				historyMarkdown = '# History\n\n';
				for (const h of this.history) {
					const dStr = formatDate(h.date, this.plugin.settings.dateFormat);
					historyMarkdown += useWikilinks ? `- [[${dStr}]] - ${h.status}\n` : `- ${dStr} - ${h.status}\n`;
				}
			}

			// Generate updated frontmatter string
			let yaml = '---\n';
			for (const [key, val] of Object.entries(updatedFm)) {
				if (val === undefined || val === null || val === '') continue;
				if (Array.isArray(val)) {
					yaml += `${key}:\n`;
					for (const item of val) {
						yaml += `  - ${item}\n`;
					}
				} else {
					yaml += `${key}: ${val}\n`;
				}
			}
			yaml += '---\n';

			const bodyText = this.bodyContent.trim() ? `\n${this.bodyContent.trim()}\n` : '';
			const finalContent = `${yaml}${bodyText}${historyMarkdown ? `\n${historyMarkdown}` : ''}`;

			await this.app.vault.modify(file, finalContent);
			await this.plugin.taskManager.reloadFile(file);
			new Notice(`Saved changes to "${this.title}"`);
		}
	}
}
