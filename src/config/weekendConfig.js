// Weekend First-Pick Checklist
// Two time slots per day: SLOT_A (12pm–3pm) and SLOT_B (3pm–6pm).
// Each slot requires a manager name and checkbox + optional photo per item.

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
      { id: 'wet_wall',         label: 'Wet wall' },
      { id: 'fm_tables',        label: 'Farmers market tables' },
      { id: 'berry_cooler',     label: 'Berry cooler' },
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
      { id: 'wall_97',       label: '97 wall' },
      { id: 'bfast_meat',    label: 'Breakfast meat' },
      { id: 'hotdog_saus',   label: 'Hot dogs / Sausage' },
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
      { id: 'toilet_paper',  label: 'Toilet paper' },
      { id: 'paper_towels',  label: 'Paper Towels' },
    ],
  },
  {
    id: 'pets',
    title: 'Pets',
    color: '#0f766e',
    items: [
      { id: 'cat_litter',     label: 'Cat Litter' },
      { id: 'canned_cat',     label: 'Canned cat food' },
    ],
  },
  {
    id: 'pharmacy',
    title: 'Pharmacy',
    color: '#9333ea',
    items: [
      { id: 'lifestyle_nut', label: 'Lifestyle nutrition' },
      { id: 'vitamins',      label: 'Vitamins' },
    ],
  },
];
