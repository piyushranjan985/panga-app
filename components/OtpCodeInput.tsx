'use client';

import { useId, useRef, useState } from 'react';

interface OtpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fires exactly once each time `value` newly reaches `length` digits, with the completed value -- lets a verify screen auto-submit the moment someone finishes typing/pasting/autofilling, without a separate "done" button press (and without relying on a parent's possibly-stale state closure). */
  onComplete?: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /** aria-label for the one real input underneath -- defaults to a sensible description since the visible "boxes" are aria-hidden decoration. */
  label?: string;
  /** Shows the boxes in an error state (e.g. after a wrong-code response) -- purely visual, doesn't clear the value itself. */
  error?: boolean;
}

/**
 * A 6-box-*looking* code input that is, underneath, exactly ONE real
 * text input -- see docs/OTP_SECURITY.md §9 for why. Splitting an OTP
 * field into 6 separate DOM inputs (the naive way to get "boxes") is
 * exactly the implementation that breaks iOS/Android SMS autofill and
 * the `autoComplete="one-time-code"` browser heuristic, since the OS
 * fills ONE text field with the whole code, not six single-digit ones
 * one at a time. This component gets the segmented look for free with
 * CSS instead: the real input sits on top, fully functional but
 * invisible (opacity: 0, not display: none, so it's still focusable,
 * paste-able, and autofillable), and six plain divs underneath render
 * whatever `value` currently holds, one character each -- paste, manual
 * typing, and OS autofill all "just work" because there's only ever one
 * real field receiving them.
 */
export default function OtpCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  autoFocus = true,
  disabled = false,
  label,
  error = false,
}: OtpCodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const firedCompleteRef = useRef(false);
  const id = useId();

  const cells = Array.from({ length }, (_, i) => value[i] ?? '');
  const nextEmptyIndex = value.length < length ? value.length : length - 1;

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) {
      if (!firedCompleteRef.current) {
        firedCompleteRef.current = true;
        onComplete?.(digits);
      }
    } else {
      firedCompleteRef.current = false;
    }
  }

  return (
    <div className="relative">
      <div className="flex justify-between gap-2" aria-hidden>
        {cells.map((char, i) => {
          const isActive = focused && !disabled && i === nextEmptyIndex;
          return (
            <div
              key={i}
              className={`flex h-14 flex-1 items-center justify-center rounded-2xl border text-2xl font-bold tabular-nums transition ${
                error
                  ? 'border-magenta bg-magenta/5 text-magenta'
                  : isActive
                    ? 'border-ink'
                    : 'border-line'
              } bg-white`}
            >
              {char || (isActive ? <span className="h-6 w-0.5 animate-pulse bg-ink/70" /> : '')}
            </div>
          );
        })}
      </div>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={length}
        aria-label={label ?? `${length}-digit verification code`}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => handleChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-text border-0 bg-transparent text-center opacity-0 outline-none"
      />
    </div>
  );
}
