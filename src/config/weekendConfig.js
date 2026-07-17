// Weekend First-Pick Checklist
// Two time slots per day: SLOT_A (12pm–3pm) and SLOT_B (3pm–6pm).
// Each section gets a per-slot associate assignment; each item has a checkbox,
// optional photos, and optional notes.

export const SLOTS = [
  { id: 'slot_a', label: '12pm – 3pm' },
  { id: 'slot_b', label: '3pm – 6pm' },
];

export const WEEKEND_DAYS = ['saturday', 'sunday'];

export const WEEKEND_SECTIONS = [
  {
    id: 'produce',
    title: 'Produce',
    color: '#16a34a',
    items: [
      { id: 'wet_wall',         label: 'Wet Wall' },
      { id: 'fm_tables',        label: 'Farmers Market Tables' },
      { id: 'berry_cooler',     label: 'Berry Cooler' },
      { id: 'grapes',           label: 'Grapes' },
      { id: 'bananas',          label: 'Bananas' },
      { id: 'organic_bananas',  label: 'Organic Bananas' },
    ],
  },
  {
    id: 'meat',
    title: 'Meat',
    color: '#dc2626',
    items: [
      { id: 'ground_beef',  label: 'Ground Beef' },
      { id: 'red_meat',     label: 'Red Meat' },
      { id: 'pork_turkey',  label: 'Pork / Turkey' },
      { id: 'chicken',      label: 'Chicken' },
    ],
  },
  {
    id: 'frozen',
    title: 'Frozen Bunker',
    color: '#0284c7',
    items: [
      { id: 'wall_97',       label: '97 Wall' },
      { id: 'bfast_meat',    label: 'Breakfast Meat' },
      { id: 'hotdog_saus',   label: 'Hot Dogs / Sausage' },
      { id: 'lunchables',    label: 'Lunchables' },
    ],
  },
  {
    id: 'dairy',
    title: 'Dairy',
    color: '#7c3aed',
    items: [
      { id: 'yogurt', label: 'Yogurt' },
      { id: 'cheese', label: 'Cheese' },
    ],
  },
  {
    id: 'paper',
    title: 'Paper Goods',
    color: '#b45309',
    items: [
      { id: 'j1',            label: 'J1' },
      { id: 'toilet_paper',  label: 'Toilet Paper' },
      { id: 'paper_towels',  label: 'Paper Towels' },
    ],
  },
  {
    id: 'pets',
    title: 'Pets',
    color: '#0f766e',
    items: [
      { id: 'cat_litter',     label: 'Cat Litter' },
      { id: 'canned_cat',     label: 'Canned Cat Food' },
    ],
  },
  {
    id: 'pharmacy',
    title: 'Pharmacy',
    color: '#9333ea',
    items: [
      { id: 'lifestyle_nut', label: 'Lifestyle Nutrition' },
      { id: 'vitamins',      label: 'Vitamins' },
    ],
  },
];
