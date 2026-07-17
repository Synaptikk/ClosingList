const TABS = [
  { id: 'home',       label: 'Home',       icon: HomeIcon },
  { id: 'checklist',  label: 'Checklist',  icon: ListIcon },
  { id: 'weekend',    label: 'Weekend',    icon: WeekendIcon },
  { id: 'associates', label: 'Associates', icon: PeopleIcon },
  { id: 'report',     label: 'Report',     icon: ReportIcon },
];

export default function BottomTabs({ view, onChange, disabled = [] }) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] z-30 no-print"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5 mx-auto max-w-screen-sm">
        {TABS.map(t => {
          const active = view === t.id;
          const off = disabled.includes(t.id);
          return (
            <li key={t.id}>
              <button
                onClick={() => !off && onChange(t.id)}
                disabled={off}
                className={
                  'w-full py-2 flex flex-col items-center gap-0.5 text-[11px] font-medium select-none ' +
                  (active ? 'text-[#0071dc]' : off ? 'text-slate-300' : 'text-slate-500 active:text-[#0071dc]')
                }
              >
                <t.icon className="w-6 h-6" />
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>; }
function ListIcon(p)    { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/></svg>; }
function WeekendIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 2v4M16 2v4"/><path d="M8 14h4M8 17h8"/></svg>; }
function PeopleIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3 3-5 7-5s7 2 7 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 20c0-2 1.5-3.5 4-3.5"/></svg>; }
function ReportIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h7"/></svg>; }
