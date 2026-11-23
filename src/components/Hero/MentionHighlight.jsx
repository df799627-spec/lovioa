import { highlightMentionTokens } from '../../utils/mentionTokens';

// Renders a read-only mirror layer behind the composer textarea so that
// canonical @ref:N tokens are visually highlighted (plain <textarea> cannot).
export default function MentionHighlight({ value, overlayRef }) {
  return (
    <div
      ref={overlayRef}
      className="hero__mention-overlay"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: `${highlightMentionTokens(value)}\n` }}
    />
  );
}
