import SectionAccordion from '../components/SectionAccordion';

export default function ChecklistView({ openSectionId, highlightTaskId, onSectionOpen }) {
  return (
    <div className="px-4 pt-4 pb-32">
      <SectionAccordion
        openSectionId={openSectionId}
        highlightTaskId={highlightTaskId}
        onSectionOpen={onSectionOpen}
      />
    </div>
  );
}
