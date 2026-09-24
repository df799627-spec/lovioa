import './SkeletonCard.css';

export default function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card__image skeleton-shimmer" />
      <div className="skeleton-card__footer">
        <div className="skeleton-card__author">
          <div className="skeleton-card__avatar skeleton-shimmer" />
          <div className="skeleton-card__author-info">
            <div className="skeleton-card__name skeleton-shimmer" />
            <div className="skeleton-card__cat skeleton-shimmer" />
          </div>
        </div>
        <div className="skeleton-card__actions">
          <div className="skeleton-card__action skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}
