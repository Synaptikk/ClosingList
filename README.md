# Closing Manager Checklist

Mobile-first webapp for Walmart closing managers to run, document, and submit the nightly close. Built for two closing managers sharing one checklist, with photos, deadline alarms, and a leadership-ready PDF/email export at the end of the night.

**Status:** Working prototype (Milestone 17). Mock backend (localStorage); UI is feature-complete.

## Run it

```bash
cd ClosingManagerChecklist
npm install      # only the first time
npm run dev      # http://localhost:5173
```

To test on a phone on the same Wi-Fi, Vite prints the LAN URL (e.g. `http://192.168.x.x:5173`) — open that on the phone. The `server: { host: true }` setting in `vite.config.js` enables this.

Build for static hosting:
```bash
npm run build    # outputs ./dist
npm run preview  # serve dist locally
```

## Current features

| Area | What works |
| --- | --- |
| Sessions | Create, join by 6-char code, recent sessions list, persistent across reload |
| Two-manager collab | "Acting as" toggle in header; each task records who completed it / last updated; presence indicator |
| Checklist | 11 sections, 53 tasks across all departments in the spec |
| Task types | checkbox, timed-checkbox, note, photo, numeric, time, yes/no, multi-select |
| Due / overdue | Per-task `dueTime`, auto-tick to "Due soon" 30 min before, "Overdue" after. Alarm panel on dashboard sorts most-urgent first |
| Owner filter | All / Mine + Shared / Mgr 1 / Mgr 2 / Shared |
| Photos | Camera capture (mobile), preview lightbox, captions, client-side JPEG compression to ~1600 px |
| Autosave | Debounced to localStorage; sync status indicator (Saving / Saved / Error) |
| Associates | Paste CSV / JSON / one-per-line; append or replace; inline edit; per-row manager |
| Reporting | Leadership preview, multi-page PDF export, mailto draft, clipboard copy, submit-and-lock |

## Mock data structure

Everything lives under the `cmc:` prefix in `localStorage`. Inspect via DevTools → Application → Local Storage.

```
cmc:activeSession        active session id
cmc:activeManager        "manager1" | "manager2"
cmc:settings             { storeNumber, marketNumber }
cmc:sessions             index: [{ id, date, storeNumber, joinCode, status, ... }]
cmc:session:<id>         the full session record (see shape below)
```

Session record:

```js
{
  id, joinCode, storeNumber, marketNumber, date,
  managers: { manager1: { name }, manager2: { name } },
  shiftNotes: '',
  status: 'open' | 'submitted',
  createdAt, updatedAt, submittedAt,
  tasks: {
    [taskId]: {
      value, notes, photos: [{ id, dataUrl, caption, uploadedAt, uploadedBy }],
      completedAt, completedBy, lastUpdatedAt, lastUpdatedBy
    }
  },
  associates: [{ id, name, shift, area, accomplishment, notes, manager }],
  presence: { manager1: ISOString, manager2: ISOString }
}
```

Persistence is hidden behind `src/lib/storage.js`. Replacing it with Firestore / Supabase later means swapping the body of that module — the rest of the app calls `useSession()` from `src/store/sessionStore.jsx` and never touches storage directly.

## How the checklist config works

The single source of truth is `src/config/checklistConfig.js`. The UI re-renders from it; nothing about sections, tasks, owners, or due times is hardcoded in components.

### Add a section

```js
// in src/config/checklistConfig.js → checklistConfig.sections
{
  id: 'pharmacy',
  title: 'Pharmacy',
  department: DEPARTMENTS.PHARMACY,   // add to DEPARTMENTS first
  defaultOwner: OWNERS.MANAGER_2,
  sortOrder: 55,
  tasks: [
    t('pharm_consult', 'Consultation window closed', TASK_TYPES.TIMED_CHECKBOX, {
      owner: OWNERS.MANAGER_2, dueTime: '21:00', priority: 'high',
    }),
    t('pharm_safe',    'Safe locked',                TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2 }),
  ],
}
```

### Add a task to an existing section

Append a `t(...)` call into the section's `tasks` array. The helper signature:

```js
t(id, title, type, {
  owner,           // OWNERS.MANAGER_1 | MANAGER_2 | SHARED | UNASSIGNED
  dueTime,         // "HH:MM" 24h local — omit for non-timed tasks
  priority,        // 'normal' | 'high'
  required,        // currently advisory
  options,         // array, only for TASK_TYPES.MULTI_SELECT
  photoOptional,   // show "Add photo" disclosure on non-photo tasks
  reportInclude,   // false to hide from the leadership PDF/email
})
```

Stored task state grows automatically — `blankTasks()` in `sessionStore.jsx` runs over the current config every time a session loads, so a new task id added in config will populate empty state on existing sessions.

### Task types

| Type | Renders as | "Complete" trigger |
| --- | --- | --- |
| `checkbox` | Big "Mark complete" button | Tap |
| `timed_checkbox` | Same, plus due time in card meta | Tap |
| `note` | Textarea | Blur with non-empty text |
| `photo` | PhotoUploader directly | First photo added (manually mark done if you want) |
| `numeric` | Number input | Blur with non-empty value |
| `time` | `<input type="time">` + "Use now" button | "Use now" auto-completes; otherwise manual |
| `yes_no` | Yes / No toggle pair | Tap |
| `multi_select` | Chip toggles | Currently not auto-complete; manual |

## How PDF export works

1. `ReportPreview` renders the report DOM on the **Report** tab.
2. `exportReportToPdf(node)` (in `src/lib/pdfExport.js`) snapshots that node with `html2canvas-pro` at 2× scale.
3. The canvas is sliced into A4-sized strips and stitched into a multi-page jsPDF document.
4. The PDF auto-downloads as `closing-<store>-<YYYYMMDD>.pdf`.

Why `html2canvas-pro` and not vanilla `html2canvas`: Tailwind v4 emits `oklch()` colors, which html2canvas 1.x cannot parse (throws "unsupported color function oklch"). The `-pro` fork handles modern CSS color functions. If you ever swap to plain html2canvas, you'll need to convert the report's colors to RGB/hex manually.

## Email export

`buildEmailBody(session)` in `src/lib/emailExport.js` generates a plain-text bullet summary grouped by department with `[x]/[!]/[~]/[-]/[ ]` glyphs. Two delivery paths:

- **Open email draft** — `mailto:` link; opens Outlook / default mail client. Subject preformatted per spec: `Store #### Closing Checklist - MM/DD/YYYY`. (Note: long bodies may be truncated by some mail clients via mailto.)
- **Copy email** — copies `Subject: ...\n\n<body>` to clipboard for paste into webmail or Slack.

## Architecture

```
src/
├── App.jsx                       top-level shell + view router
├── main.jsx
├── index.css                     @import "tailwindcss" + a few base resets
├── config/
│   └── checklistConfig.js        sections + tasks + types  ← single source of truth
├── store/
│   └── sessionStore.jsx          React context + reducer; useSession() hook
├── lib/
│   ├── storage.js                localStorage wrapper (swap to Firestore here)
│   ├── joinCode.js               6-char unambiguous codes
│   ├── timeUtils.js              dueTime, computeStatus, formatters
│   ├── associateImport.js        JSON / CSV / line-list parser
│   ├── pdfExport.js              html2canvas-pro → jsPDF multipage
│   └── emailExport.js            subject + body + mailto + clipboard
├── components/
│   ├── MobileHeader.jsx          sticky header + acting-as toggle
│   ├── BottomTabs.jsx            mobile tab bar
│   ├── JoinSessionCard.jsx       start / join / recent sessions
│   ├── DashboardSummary.jsx      progress, counts, sections grid, manager names
│   ├── AlarmPanel.jsx            sorted upcoming deadlines
│   ├── DueSoonBanner.jsx         top-of-dashboard alert
│   ├── ManagerPresenceBadge.jsx  green-dot online indicators
│   ├── SyncStatusIndicator.jsx
│   ├── SectionAccordion.jsx      + owner filter
│   ├── TaskCard.jsx              renders all 8 task types
│   ├── TaskStatusBadge.jsx
│   ├── PhotoUploader.jsx         camera + preview + caption + compression
│   ├── AssociateImportPanel.jsx  paste / parse / edit
│   └── ReportPreview.jsx         leadership-ready DOM (also the PDF source)
└── views/
    ├── DashboardView.jsx
    ├── ChecklistView.jsx
    ├── AssociatesView.jsx
    └── ReportView.jsx
```

## Known limitations of this prototype

- **Real two-device collab is mocked.** Both managers use the same browser's localStorage. The "Acting as" toggle simulates handoff. Real-time sync requires a backend (Firebase / Supabase) — slot into `src/lib/storage.js`.
- **Photos live in localStorage.** Compressed JPEGs ~50-150 kB each. A few dozen photos work fine; hundreds will hit the ~5 MB localStorage quota and trigger a sync error. Real backend needs object storage (Firebase Storage etc.).
- **Browser notifications/sound for overdue tasks are not wired.** The UI flashes overdue states clearly; adding `Notification.requestPermission()` is a small follow-up.
- **No auth.** Per spec: "Do not build enterprise auth yet."
- **Join code only resolves on-device.** Same constraint as the above; a real backend would make codes globally resolvable.

## Recommended next steps

1. **Live test on a phone** during an actual close. The dev server's LAN URL is enough for a one-night trial — note what's missing or awkward.
2. **Swap localStorage for Firestore** (or Supabase). The work is confined to `src/lib/storage.js` and one new `useFirestoreSync` hook inside `sessionStore.jsx`. The data model is already Firestore-friendly.
3. **Wire the associate import** to the existing `ClosingList` Chrome extension's output JSON. Its `casevisibility-recon-*.json` shape already covers name/shift/area; the parser in `src/lib/associateImport.js` will accept it after a small field map.
4. **Browser notifications** for overdue tasks — `Notification.requestPermission()` on session start, push a notification when any task crosses its `dueTime`.
5. **Per-task required-photo enforcement** — block submit until all `required: true` photo tasks have an upload.
6. **Site-wide PWA** (manifest + service worker) so the app installs to home screen and survives offline shifts. Vite has a one-line plugin.
