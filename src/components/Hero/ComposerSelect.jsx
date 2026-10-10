import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function ComposerSelect({
  icon: Icon,
  value,
  options,
  onChange,
  label,
  className = '',
  renderValue = option => option?.label || option?.value || '',
  renderOption = option => option?.label || option?.value || '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxId = useId();
  const currentIndex = Math.max(0, options.findIndex(option => option.value === value));
  const selectedOption = options[currentIndex] || options[0];

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

      event.preventDefault();
      const nextIndex = event.key === 'ArrowDown'
        ? Math.min(currentIndex + 1, options.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(currentIndex - 1, 0)
          : event.key === 'Home'
            ? 0
            : options.length - 1;
      const nextOption = options[nextIndex];
      if (nextOption) {
        onChange(nextOption.value);
        requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => optionRefs.current[currentIndex]?.focus());

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentIndex, onChange, open, options]);

  return (
    <div className={`hero__composer-select ${className} ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="hero__composer-select-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onClick={() => setOpen(current => !current)}
      >
        {Icon && <Icon size={14} aria-hidden="true" />}
        <span>{renderValue(selectedOption)}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open && (
        <div className="hero__composer-select-menu" id={listboxId} role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={element => { optionRefs.current[index] = element; }}
              type="button"
              className={`hero__composer-select-option ${option.value === value ? 'is-selected' : ''}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onChange(option.value);
                  setOpen(false);
                }
              }}
            >
              <span>{renderOption(option)}</span>
              {option.value === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
