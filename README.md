# Life Manager for Obsidian

A comprehensive, modular workspace for **personal and professional life management** directly inside Obsidian. Featuring interactive **Gantt timelines**, **Kanban boards**, **Table data grids**, **Calendar**, and **Lifecycle Flow & History Analytics**.

The unique power of Life Manager is its **status history tracking** directly within note markdown (`# History`), allowing you to visualize multi-colored lifecycle segments on the timeline, track cycle time per stage, detect workflow bottlenecks/reworks, and preserve regular note bodies without destructive overwrites.

---

## 🚀 Installation & Sync (BRAT Plugin - Recommended)

To use Life Manager on any computer (personal, work, etc.) without needing Node.js or running terminal commands:

1. Install the **Obsidian42 - BRAT** community plugin from **Settings → Community plugins**.
2. Open the command palette (`Ctrl+P` / `Cmd+P`) and select **BRAT: Add a beta plugin for testing**.
3. Paste your repository URL:
   ```
   https://github.com/bernardomerlo/obsidian
   ```
4. BRAT will automatically download the compiled release files (`main.js`, `manifest.json`, `styles.css`) and enable **Life Manager**.
5. Whenever a new version tag is pushed to GitHub, BRAT will update the plugin automatically on all your machines!

---

## 📌 Note Structure

Life Manager task and project notes are standard Obsidian markdown files with optional frontmatter metadata, a freeform body, and a `# History` section:

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
- **Body Preservation**: Everything between frontmatter and `# History` is treated as a normal note and is never wiped or altered during status updates.
- **Bi-directional Sync**: Dragging cards on the Kanban board, picking a status from the Table dropdown, or updating dates in the modal automatically updates the frontmatter `status` AND appends `- [[DD-MM-YYYY]] - <new_status>` to `# History`.
- **Flexible Date Formats**: Supports `DD-MM-YYYY` (e.g. `01-08-2026`), `YYYY-MM-DD` (e.g. `2026-08-01`), and daily note wikilinks `[[01-08-2026]]`.

---

## 🚀 Features & Views

### 1. Gantt Timeline View
- **Multi-Status Segmented Bars**: Toggle between a single task bar or segmented bars showing each colored phase (`todo` → `dev` → `hom` → `dev` → `done`) directly on the timeline.
- **Zoom Scales**: Day, Week, Month, Quarter, Year.
- **Folder / Project Tree**: Collapsible and expandable hierarchy based on folder structures.
- **Interactive Drag & Resize**: Drag anywhere to move dates, drag handles to adjust start/end dates.
- **Today Indicator**: Vertical line with floating current-day badge.

### 2. Table / Data Grid View
- Interactive table with sortable headers (Title, Status, Assignee, Start, End, Duration, Rework count).
- Clickable status badges for instant transition logging.
- Status progression visual breadcrumbs (`todo → dev → hom → done`) with rework indicator pills.

### 3. Kanban Board View
- Status columns (`todo`, `dev`, `hom`, `done`, etc.).
- Drag & Drop task cards between columns. Moving a card instantly logs the transition to the note's `# History` with today's date link!
- Shows active days in current status (`⏳ 4d in dev`).

### 4. Calendar View
- Monthly grid with task spanning bars.
- Today highlight and month navigation.
- Click any date cell to create a task starting on that date.

### 5. Flow & History Analytics View
- **Executive Metrics**: Total tasks, completed, in-progress, average lead time, total rework counts, rework rate percentage.
- **Cycle Time Breakdown**: Visual bars displaying average days spent in each stage (`todo`, `dev`, `hom`, `done`).
- **Rework & Bottleneck Watchlist**: Identifies tasks that were sent backwards (e.g., `hom` → `dev`) to highlight bottlenecks.
- **Transition Activity Feed**: Real-time chronological audit trail of all status transitions across your vault.

---

## 🧩 Embedded Codeblocks

Embed interactive views in any note using ```manager or ```life-manager code blocks:

````markdown
```manager
folder: "Projects"
tag: "backend"
view: "gantt" # gantt | table | kanban | calendar | analytics
scale: "week"
showSegments: true
```
````

---

## ⚡ Commands

- `Life Manager: Open Life Manager workspace`: Opens the full interactive workspace view.
- `Life Manager: Create new task note`: Opens modal to create a task with frontmatter and initial `# History`.
- `Life Manager: Update status of active note`: Quick status picker for the open note.
- `Life Manager: Refresh Life Manager data`: Scans and reloads all tasks from the vault.

---

## 🛠️ Development & Releases

```bash
# Install dependencies
npm install

# Production build
npm run build
```

To create a new release on GitHub for BRAT to pick up:
```bash
git tag 1.0.0
git push origin 1.0.0
```
GitHub Actions will automatically build `main.js`, attach `manifest.json` and `styles.css`, and create the release.
