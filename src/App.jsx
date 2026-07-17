import { useState } from 'react';
import { SessionProvider, useSession } from './store/sessionStore';
import { WeekendProvider } from './store/weekendStore';
import MobileHeader from './components/MobileHeader';
import BottomTabs from './components/BottomTabs';
import JoinSessionCard from './components/JoinSessionCard';
import DashboardView from './views/DashboardView';
import ChecklistView from './views/ChecklistView';
import AssociatesView from './views/AssociatesView';
import ReportView from './views/ReportView';
import WeekendView from './views/WeekendView';

export default function App() {
  return (
    <SessionProvider>
      <WeekendProvider>
        <AppInner />
      </WeekendProvider>
    </SessionProvider>
  );
}

function AppInner() {
  const { session } = useSession();
  const [view, setView] = useState('home');
  const [openSectionId, setOpenSectionId] = useState(null);
  const [highlightTaskId, setHighlightTaskId] = useState(null);

  function jumpToSection(id) {
    setOpenSectionId(id);
    setHighlightTaskId(null);
    setView('checklist');
  }

  function openTask(task) {
    setOpenSectionId(task.sectionId);
    setHighlightTaskId(task.id);
    setView('checklist');
  }

  return (
    <div className="min-h-full mx-auto max-w-screen-sm">
      <MobileHeader view={view} />

      <main className="pb-16">
        {view === 'weekend' && <WeekendView />}
        {view !== 'weekend' && !session && <JoinSessionCard />}
        {view !== 'weekend' && session && view === 'home' && (
          <DashboardView
            onJumpToChecklist={() => setView('checklist')}
            onJumpToSection={jumpToSection}
            onOpenTask={openTask}
          />
        )}
        {view !== 'weekend' && session && view === 'checklist' && (
          <ChecklistView
            openSectionId={openSectionId}
            highlightTaskId={highlightTaskId}
            onSectionOpen={setOpenSectionId}
          />
        )}
        {view !== 'weekend' && session && view === 'associates' && <AssociatesView />}
        {view !== 'weekend' && session && view === 'report' && <ReportView />}
      </main>

      <BottomTabs view={view} onChange={setView} disabled={session ? [] : ['home', 'checklist', 'associates', 'report']} />
    </div>
  );
}
