import { useState } from 'react';
import { Share2, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { trackAction } from '../../services/analytics';
import './ShareButton.css';

export default function ShareButton({ url, title, onCopied }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const PLATFORMS = [
    {
      key: 'x',
      label: 'X (Twitter)',
      getUrl: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
      color: '#000',
    },
    {
      key: 'facebook',
      label: 'Facebook',
      getUrl: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
      color: '#1877F2',
    },
    {
      key: 'pinterest',
      label: 'Pinterest',
      getUrl: (u) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(u)}`,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/>
        </svg>
      ),
      color: '#E60023',
    },
    {
      key: 'reddit',
      label: 'Reddit',
      getUrl: (u, t) => `https://reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}`,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.153.02 1.153.02s.465.026.829.071c1.277.137 1.78 1.129 1.78 2.509 0 1.38-1.495 2.5-3.31 2.5-1.816 0-3.31-1.12-3.31-2.5 0-1.38 1.495-2.5 3.31-2.5zm-.719 4.245c-1.816 0-3.31 1.12-3.31 2.5 0 1.38 1.494 2.5 3.31 2.5s3.31-1.12 3.31-2.5c0-.37-.065-.722-.187-1.019-.122-.297-.293-.524-.51-.682-.217-.158-.467-.241-.772-.241-.306 0-.556.083-.773.241-.217.158-.387.385-.51.682-.122.297-.186.649-.186 1.019 0 1.38-1.495 2.5-3.31 2.5zm-4.601 8.011c0 2.21 1.794 4.01 4.01 4.01 2.205 0 4.01-1.8 4.01-4.01 0-2.21-1.805-4.01-4.01-4.01-2.216 0-4.01 1.8-4.01 4.01zm.919-4.424c-1.816 0-3.31 1.12-3.31 2.5s1.494 2.5 3.31 2.5c.898 0 1.698-.384 2.247-1.002-.073-.09-.144-.18-.21-.277-.154-.23-.302-.475-.428-.719-.126-.244-.21-.51-.21-.755 0-.37.065-.722.187-1.019.122-.297.293-.524.51-.682.217-.158.467-.241.773-.241.305 0 .555.083.772.241.218.158.388.385.511.682.122.297.186.649.186 1.019 0 .245-.084.511-.21.755-.126.244-.274.489-.428.719-.066.097-.137.187-.21.277.549.618 1.349 1.002 2.247 1.002zM20.314 9.94c0 .553-.448 1.001-1.001 1.001-.552 0-1.001-.448-1.001-1.001 0-.552.449-1 1.001-1s1.001.448 1.001 1z"/>
        </svg>
      ),
      color: '#FF4500',
    },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      getUrl: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      ),
      color: '#0A66C2',
    },
    {
      key: 'copy',
      label: copied ? t('share.copied') : t('share.copyLink', 'Copy link'),
      icon: copied ? <Check size={15} /> : <Share2 size={15} />,
      color: copied ? '#B5622A' : '#6b7280',
    },
  ];

  const handleShare = (platform) => {
    const fullUrl = window.location.origin + url;
    const text = title || '';
    trackAction('act_share', { platform: platform.key });
    if (platform.key === 'copy') {
      navigator.clipboard.writeText(fullUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        onCopied?.();
      });
    } else {
      window.open(platform.getUrl(fullUrl, text), '_blank', 'noopener,noreferrer,width=600,height=500');
    }
    setOpen(false);
  };

  return (
    <div className="share-btn-wrap">
      <button
        className="share-btn"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(o => !o);
        }}
        title="Share"
        aria-label="Share this prompt"
        aria-expanded={open}
      >
        {copied ? <Check size={14} /> : <Share2 size={14} />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="share-overlay-backdrop" onClick={() => setOpen(false)} />
            <motion.div
              className="share-popover"
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={e => e.stopPropagation()}
            >
              <div className="share-popover__header">
                <span>{t('share.popoverTitle')}</span>
                <button className="share-popover__close" onClick={() => setOpen(false)}>
                  <X size={12} />
                </button>
              </div>
              <div className="share-popover__grid">
                {PLATFORMS.map(p => (
                  <button
                    key={p.key}
                    className={`share-popover__item${p.key === 'copy' && copied ? ' copied' : ''}`}
                    onClick={() => handleShare(p)}
                    style={{ '--platform-color': p.color }}
                  >
                    <span className="share-popover__icon">{p.icon}</span>
                    <span className="share-popover__label">{p.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}