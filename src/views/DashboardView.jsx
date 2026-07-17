import DashboardSummary from '../components/DashboardSummary';
import AlarmPanel from '../components/AlarmPanel';
import DueSoonBanner from '../components/DueSoonBanner';

export default function DashboardView({ onJumpToChecklist, onJumpToSection, onOpenTask }) {
  return (
    <div className="px-4 pt-4 pb-32 space-y-4">
      <DueSoonBanner onJumpToChecklist={onJumpToChecklist} />
      <AlarmPanel onOpenTask={onOpenTask} />
      <DashboardSummary onJumpToSection={onJumpToSection} />
    </div>
  );
}
