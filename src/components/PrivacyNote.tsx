/**
 * PrivacyNote
 *
 * A small, unobtrusive glass pill that reassures the user the webcam feed never
 * leaves their machine. Used in the consent screen, calibration view, and the
 * watch-page header.
 */

export interface PrivacyNoteProps {
  /** Extra classes for positioning / spacing supplied by the parent. */
  className?: string;
}

export function PrivacyNote({ className = "" }: PrivacyNoteProps): JSX.Element {
  return (
    <div
      className={`chip glass-soft text-slate-400 ${className}`}
      // Announce as a single informational unit to assistive tech.
      role="note"
      aria-label="Webcam processing runs locally. No video is uploaded or stored."
    >
      {/* Shield-with-lock icon — drawn inline since no icon library is installed. */}
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 shrink-0 text-brand-300"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Shield outline */}
        <path d="M12 3l7 3v5c0 4.4-3 8.2-7 9.4C8 19.2 5 15.4 5 11V6l7-3z" />
        {/* Padlock body */}
        <rect x="9.25" y="11" width="5.5" height="4.5" rx="0.8" />
        {/* Padlock shackle */}
        <path d="M10.25 11V9.75a1.75 1.75 0 0 1 3.5 0V11" />
      </svg>
      <span className="leading-none">
        Webcam processing runs locally. No video is uploaded or stored.
      </span>
    </div>
  );
}

export default PrivacyNote;
