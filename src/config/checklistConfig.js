// Modular checklist configuration.
// This file is the single source of truth for sections + tasks.
// Add/edit/remove sections or tasks here; the UI re-renders accordingly.
//
// Task types:
//   "checkbox"       — done / not done
//   "timed_checkbox" — checkbox + auto-records completedAt against dueTime
//   "note"           — freeform text
//   "photo"          — photo upload (required if `required: true`)
//   "numeric"        — number input
//   "time"           — HH:MM input (e.g., "last pick finished")
//   "yes_no"         — yes / no toggle
//   "multi_select"   — pick any from options[]
//
// Owner: "manager1" | "manager2" | "shared" | "unassigned"
// dueTime: "HH:MM" 24h local. Omit for non-timed tasks.
// reportInclude: false hides from leadership PDF/email summary.

export const OWNERS = {
  MANAGER_1: 'manager1',
  MANAGER_2: 'manager2',
  SHARED: 'shared',
  UNASSIGNED: 'unassigned',
};

export const TASK_TYPES = {
  CHECKBOX: 'checkbox',
  TIMED_CHECKBOX: 'timed_checkbox',
  NOTE: 'note',
  PHOTO: 'photo',
  NUMERIC: 'numeric',
  TIME: 'time',
  YES_NO: 'yes_no',
  MULTI_SELECT: 'multi_select',
};

export const DEPARTMENTS = {
  FOOD: 'Food',
  DIGITAL_OGP: 'Digital / OGP',
  GM: 'General Merchandise',
  APPAREL: 'Apparel',
  CONSUMABLES: 'Consumables',
  FRONT_END: 'Front End / Service',
  HANDOFF: 'Third Shift Handoff',
  ASSOCIATES: 'Associates',
  TRUCK: 'Truck / Backroom',
  SAFETY: 'Safety / Compliance',
  NOTES: 'Important Notes',
};

// Helper for generating stable IDs in config.
const t = (id, title, type, opts = {}) => ({
  id,
  title,
  type,
  priority: opts.priority || 'normal',
  owner: opts.owner || OWNERS.UNASSIGNED,
  dueTime: opts.dueTime,
  required: !!opts.required,
  description: opts.description,
  options: opts.options,
  reportInclude: opts.reportInclude !== false,
  photoOptional: !!opts.photoOptional,
});

export const checklistConfig = {
  sections: [
    {
      id: 'food',
      title: 'Food',
      department: DEPARTMENTS.FOOD,
      defaultOwner: OWNERS.MANAGER_1,
      sortOrder: 10,
      tasks: [
        t('food_baler', 'Bale made', TASK_TYPES.TIMED_CHECKBOX, {
          owner: OWNERS.MANAGER_1, dueTime: '21:45', priority: 'high', photoOptional: true,
        }),
        t('food_cust_clear', 'Customer-facing food areas clear', TASK_TYPES.CHECKBOX, {
          owner: OWNERS.MANAGER_1, dueTime: '20:00', photoOptional: true,
        }),
        t('food_milk',      'Milk full',                       TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_1, photoOptional: true }),
        t('food_water',     'Water full',                      TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_1, photoOptional: true }),
        t('food_eggs',      'Eggs full',                       TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_1, photoOptional: true }),
        t('food_dairy',     'Dairy / frozen clean',            TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_1, photoOptional: true }),
        t('food_claims',    'Claims processed',                TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_1 }),
        t('food_returns',   'Returns complete',                TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_1 }),
        t('food_receiving', 'Receiving clear for vendors',     TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_1, photoOptional: true }),
        t('food_handoff',   'Overnight handoff notes',         TASK_TYPES.NOTE,     { owner: OWNERS.MANAGER_1 }),
      ],
    },
    {
      id: 'digital_ogp',
      title: 'Digital / OGP',
      department: DEPARTMENTS.DIGITAL_OGP,
      defaultOwner: OWNERS.MANAGER_1,
      sortOrder: 20,
      tasks: [
        t('ogp_last_pick', 'Last pick finished time', TASK_TYPES.TIME, {
          owner: OWNERS.MANAGER_1, dueTime: '21:30', priority: 'high',
        }),
        t('ogp_closing_done', 'OGP closing tasks completed', TASK_TYPES.TIMED_CHECKBOX, {
          owner: OWNERS.MANAGER_1, dueTime: '22:00', priority: 'high',
        }),
        t('ogp_returns', 'Returns staged / cleared', TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_1 }),
        t('ogp_equipment', 'Equipment placed / charging', TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_1, photoOptional: true }),
        t('ogp_exceptions', 'Exceptions / late picks notes', TASK_TYPES.NOTE, { owner: OWNERS.MANAGER_1 }),
        t('ogp_dispense', 'Dispense area condition', TASK_TYPES.NOTE, { owner: OWNERS.MANAGER_1, photoOptional: true }),
      ],
    },
    {
      id: 'gm',
      title: 'General Merchandise',
      department: DEPARTMENTS.GM,
      defaultOwner: OWNERS.MANAGER_2,
      sortOrder: 30,
      tasks: [
        t('gm_baler', 'GM cardboard baler empty & ready for 3rd shift', TASK_TYPES.TIMED_CHECKBOX, {
          owner: OWNERS.MANAGER_2, dueTime: '21:45', priority: 'high', photoOptional: true,
        }),
        t('gm_electronics_register', 'Electronics register clear', TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2, photoOptional: true }),
        t('gm_sporting_register',    'Sporting Goods register clear', TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2, photoOptional: true }),
        t('gm_garden_register',      'Garden Center register clear',  TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2, photoOptional: true }),
      ],
    },
    {
      id: 'apparel',
      title: 'Apparel',
      department: DEPARTMENTS.APPAREL,
      defaultOwner: OWNERS.MANAGER_2,
      sortOrder: 40,
      tasks: [
        t('app_ladies',  'Ladies zoned',     TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2, photoOptional: true }),
        t('app_mens',    'Mens zoned',       TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2, photoOptional: true }),
        t('app_girls',   'Girls zoned',      TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2, photoOptional: true }),
        t('app_boys',    'Boys zoned',       TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2, photoOptional: true }),
        t('app_shoes',   'Shoes zoned',      TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2, photoOptional: true }),
        t('app_jewelry', 'Jewelry zoned',    TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2, photoOptional: true }),
        t('app_fitting', 'Fitting room cleared', TASK_TYPES.CHECKBOX, { owner: OWNERS.MANAGER_2 }),
      ],
    },
    {
      id: 'consumables',
      title: 'Consumables',
      department: DEPARTMENTS.CONSUMABLES,
      defaultOwner: OWNERS.SHARED,
      sortOrder: 50,
      tasks: [
        t('cons_hba', 'HBA / pharmacy OTC area notes', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('cons_cosmetics', 'Cosmetics / security notes', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('cons_pets', 'Pets / chemicals / paper condition', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('cons_returns', 'Returns / go-backs', TASK_TYPES.CHECKBOX, { owner: OWNERS.SHARED }),
      ],
    },
    {
      id: 'front_end',
      title: 'Front End / Service',
      department: DEPARTMENTS.FRONT_END,
      defaultOwner: OWNERS.SHARED,
      sortOrder: 60,
      tasks: [
        t('fe_servicedesk', 'Service desk clear', TASK_TYPES.TIMED_CHECKBOX, {
          owner: OWNERS.SHARED, dueTime: '22:00', priority: 'high',
        }),
        t('fe_returns', 'Returns staged / processed', TASK_TYPES.CHECKBOX, { owner: OWNERS.SHARED }),
        t('fe_cust_clear', 'Customer-facing areas clear', TASK_TYPES.TIMED_CHECKBOX, {
          owner: OWNERS.SHARED, dueTime: '20:00', priority: 'high',
        }),
        t('fe_carts', 'Carts / vestibule condition', TASK_TYPES.NOTE, { owner: OWNERS.SHARED, photoOptional: true }),
        t('fe_cashoffice', 'Cash office / service desk notes', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
      ],
    },
    {
      id: 'truck',
      title: 'Truck / Backroom',
      department: DEPARTMENTS.TRUCK,
      defaultOwner: OWNERS.SHARED,
      sortOrder: 70,
      tasks: [
        t('truck_unloaded', 'Truck unloaded time', TASK_TYPES.TIME, { owner: OWNERS.SHARED, priority: 'high' }),
        t('truck_pulled', 'Truck pulled out time', TASK_TYPES.TIME, { owner: OWNERS.SHARED, priority: 'high' }),
        t('truck_backroom', 'Backroom cleared / blocked notes', TASK_TYPES.NOTE, { owner: OWNERS.SHARED, photoOptional: true }),
        t('truck_pallets', 'Pallet concerns', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('truck_highticket', 'High-ticket / security notes', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('truck_safety', 'Safety concerns', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
      ],
    },
    {
      id: 'safety',
      title: 'Safety / Compliance',
      department: DEPARTMENTS.SAFETY,
      defaultOwner: OWNERS.SHARED,
      sortOrder: 80,
      tasks: [
        t('saf_hazards', 'Customer-facing trip hazards', TASK_TYPES.YES_NO, { owner: OWNERS.SHARED, priority: 'high' }),
        t('saf_spill', 'Spill stations stocked', TASK_TYPES.CHECKBOX, { owner: OWNERS.SHARED }),
        t('saf_exits', 'Fire exits unobstructed', TASK_TYPES.YES_NO, { owner: OWNERS.SHARED, priority: 'high' }),
        t('saf_compactor', 'Compactor / baler concerns', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('saf_lockedcase', 'Locked cases secured', TASK_TYPES.CHECKBOX, { owner: OWNERS.SHARED }),
        t('saf_emergency', 'Emergency issues', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
      ],
    },
    {
      id: 'handoff',
      title: 'Third Shift Handoff',
      department: DEPARTMENTS.HANDOFF,
      defaultOwner: OWNERS.SHARED,
      sortOrder: 90,
      tasks: [
        t('hand_callouts', 'Third shift call-outs', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('hand_attention', 'Areas needing attention', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('hand_available', 'Associates available', TASK_TYPES.NUMERIC, { owner: OWNERS.SHARED }),
        t('hand_blockers', 'Major blockers', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('hand_leadership', 'Notes for overnight leadership', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
      ],
    },
    {
      id: 'notes',
      title: 'Important Notes',
      department: DEPARTMENTS.NOTES,
      defaultOwner: OWNERS.SHARED,
      sortOrder: 100,
      tasks: [
        t('notes_freeform', 'Freeform notes', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('notes_leadership', 'Leadership handoff', TASK_TYPES.NOTE, { owner: OWNERS.SHARED }),
        t('notes_followup', 'Urgent follow-up', TASK_TYPES.NOTE, { owner: OWNERS.SHARED, priority: 'high' }),
        t('notes_photos', 'Photos for context', TASK_TYPES.PHOTO, { owner: OWNERS.SHARED }),
      ],
    },
  ],
};

export function getAllTasks(config = checklistConfig) {
  return config.sections.flatMap(s => s.tasks.map(task => ({ ...task, sectionId: s.id, sectionTitle: s.title })));
}

export function getSectionById(id, config = checklistConfig) {
  return config.sections.find(s => s.id === id);
}

export function getTaskById(taskId, config = checklistConfig) {
  for (const s of config.sections) {
    const t = s.tasks.find(t => t.id === taskId);
    if (t) return { ...t, sectionId: s.id, sectionTitle: s.title };
  }
  return null;
}
