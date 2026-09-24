import PromptCard from '../PromptCard/PromptCard';
import SkeletonCard from '../SkeletonCard/SkeletonCard';
import './PromptGrid.css';

export default function PromptGrid({ prompts, loading }) {
  if (loading) {
    return (
      <div className="prompt-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!prompts || prompts.length === 0) {
    return (
      <div className="prompt-grid-empty">
        <div className="prompt-grid-empty__icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="6" width="16" height="16" rx="3" stroke="var(--color-border)" strokeWidth="2"/>
            <rect x="26" y="6" width="16" height="16" rx="3" stroke="var(--color-border)" strokeWidth="2"/>
            <rect x="6" y="26" width="16" height="16" rx="3" stroke="var(--color-border)" strokeWidth="2"/>
            <rect x="26" y="26" width="16" height="16" rx="3" stroke="var(--color-border)" strokeWidth="2"/>
          </svg>
        </div>
        <h3 className="prompt-grid-empty__title">No prompts found</h3>
        <p className="prompt-grid-empty__text">Be the first to share a stunning AI photography prompt in this category.</p>
      </div>
    );
  }

  return (
      <div className="prompt-grid">
        {prompts.map((prompt, i) => (
          <PromptCard key={prompt.id} prompt={prompt} index={i} compact />
        ))}
      </div>
  );
}
