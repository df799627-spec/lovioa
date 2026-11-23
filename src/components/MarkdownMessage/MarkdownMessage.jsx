import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import './MarkdownMessage.css';

const markdownComponents = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
  img: ({ node, ...props }) => (
    <img {...props} loading="lazy" />
  ),
};

export default function MarkdownMessage({ children, className = '' }) {
  const text = String(children || '');
  const classes = ['markdown-message', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
