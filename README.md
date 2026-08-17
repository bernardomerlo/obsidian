# Task Gantt for Obsidian

An advanced project management plugin for Obsidian featuring **interactive Gantt charts**, **Table data grid**, **Kanban board**, **Calendar**, and **Status History & Flow Analytics**.

The unique power of Task Gantt is its **status history tracking** directly within note markdown (`# History`), allowing you to visualize multi-colored task lifecycle segments on the Gantt timeline, track cycle time per stage, detect workflow rework/regressions, and preserve regular note bodies without destructive overwrites.

---

## 📌 Note Structure

Task notes are standard Obsidian markdown files with optional frontmatter metadata, a freeform body, and a `# History` section:

```markdown
---
start: 2026-08-01
end: 2026-08-10
status: Done
assignee: Bernardo
tags:
  - backend
  - auth
---
Everything before # History counts as regular note body content (checklists, notes, links, etc.).

# History

- [[01-08-2026]] - todo
- [[02-08-2026]] - dev
- [[04-08-2026]] - hom
- [[06-08-2026]] - dev
- [[10-08-2026]] - hom
- [[10-08-2026]] - done
```

### Key Behaviors:
- **Body Preservation**: Everything between the frontmatter and `# History` is treated as a normal note and is never wiped or altered during status updates.
- **Bi-directional Sync**: Dragging cards on the Kanban board, picking a status from the Table dropdown, or updating dates in the modal automatically updates the frontmatter `status` AND appends `- [[DD-MM-YYYY]] - <new_status>` to `# History`.
- **Flexible Date Formats**: Supports `DD-MM-YYYY` (e.g. `01-08-2026`), `YYYY-MM-DD` (e.g. `2026-08-01`), and daily note wikilinks `[[01-08-2026]]`.

---

## 🚀 Features & Views

### 1. Gantt Chart View
- **Multi-Status Segmented Bars**: Toggle between a single task bar or segmented bars showing each colored phase (`todo` → `dev` → `hom` → `dev` → `done`) directly on the timeline.
- **Zoom Scales**: Day, Week, Month, Quarter, Year.
- **Today Indicator**: Vertical line with floating current-day badge.
- **Interactive Controls**: Hover tooltips with full history flow, right-click context menus, search filtering.

### 2. Table / Data Grid View
- Interactive table with sortable headers (Title, Status, Assignee, Start, End, Duration, Rework count).
- Clickable status badges for instant transition logging.
- Status progression visual breadcrumbs (`todo → dev → hom → done`) with rework indicator pills.

### 3. Kanban Board View
- Status columns (`todo`, `dev`, `hom`, `done`, etc.).
- Drag & Drop task cards between columns. Moving a card instantly logs the transition to the note's `# History` with today's date link!
- Shows active days in current status (`⏳ 4d in dev`).

### 4. Calendar View
- Monthly grid with event task spanning bars.
- Today highlight and month navigation.
- Click any date cell to create a task starting on that date.

### 5. Flow & History Analytics View
- **Executive Metrics**: Total tasks, completed, in-progress, average lead time, total rework counts, rework rate percentage.
- **Cycle Time Breakdown**: Visual bars displaying average days spent in each stage (`todo`, `dev`, `hom`, `done`).
- **Rework & Bottleneck Watchlist**: Identifies tasks that were sent backwards (e.g., `hom` → `dev`) to highlight QA and development bottlenecks.
- **Transition Activity Feed**: Real-time chronological audit trail of all status transitions across your vault.

---

## 🧩 Embedded Codeblocks

Embed interactive views in any note using ```gantt code blocks:

````markdown
```gantt
folder: "Projects"
tag: "backend"
view: "gantt" # gantt | table | kanban | calendar | analytics
scale: "week"
showSegments: true
```
````

---

## ⚡ Commands

- `Task Gantt: Open Task Gantt view`: Opens the full interactive workspace view.
- `Task Gantt: Create new task note`: Opens modal to create a task with frontmatter and initial `# History`.
- `Task Gantt: Update status of active note`: Quick status picker for the open note.
- `Task Gantt: Refresh task data`: Scans and reloads all tasks from the vault.

---

## 🛠️ Development & Building

```bash
# Install dependencies
npm install

# Watch mode
npm run dev

# Production build
npm run build
```
