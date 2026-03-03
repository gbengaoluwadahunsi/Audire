/**
 * Audire logo — single source of truth for all navbars and footers.
 * Book + sound wave icon (read + listen). Use with or without wordmark.
 */
import { Link } from 'react-router-dom';

const Icon = ({ size = 'md', className = '' }) => {
  const isSm = size === 'sm';
  const box = isSm ? 'w-6 h-6' : 'w-8 h-8';
  const icon = isSm ? 'w-3.5 h-3.5' : 'w-full h-full';
  return (
    <div className={`${box} shrink-0 text-primary ${className}`} aria-hidden>
      <svg className={icon} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M3 19V5a2 2 0 012-2h8v18H5a2 2 0 01-2-2z" fill="currentColor" />
        <path d="M16 9a3.5 3.5 0 010 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M19.5 6.5a7.5 7.5 0 010 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      </svg>
    </div>
  );
};

const Wordmark = ({ size = 'md', className = '' }) => {
  const isSm = size === 'sm';
  const textClass = isSm ? 'text-base font-bold' : 'text-xl font-bold';
  return (
    <span className={`tracking-tight text-inherit ${textClass} ${className}`}>
      Audire
    </span>
  );
};

/**
 * @param {Object} props
 * @param {boolean} [props.withWord=true] - Show "Audire" wordmark next to icon
 * @param {'sm'|'md'} [props.size='md'] - Icon + wordmark size
 * @param {string} [props.className] - Wrapper class (e.g. text-white)
 * @param {boolean} [props.asLink=true] - Wrap in Link to "/" (set false in footer or when already inside a link)
 */
export default function Logo({ withWord = true, size = 'md', className = '', asLink = true }) {
  const content = (
    <>
      <Icon size={size} />
      {withWord && <Wordmark size={size} />}
    </>
  );

  const wrapperClass = `flex items-center gap-2 ${className}`.trim();

  if (asLink) {
    return (
      <Link to="/" className={wrapperClass} aria-label="Audire home">
        {content}
      </Link>
    );
  }
  return <div className={wrapperClass}>{content}</div>;
}

export { Icon as LogoIcon, Wordmark as LogoWordmark };
