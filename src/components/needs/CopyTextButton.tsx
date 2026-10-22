'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Clipboard } from 'lucide-react';

interface CopyTextButtonProps {
  text: string;
  label?: string;
}

/** Copies `text` to the clipboard and shows a check for 1.5 s. Renders nothing where the Clipboard API is unavailable. */
export default function CopyTextButton({ text, label = 'Copy' }: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false);
  // Detected after mount: `navigator` doesn't exist during SSR, so checking it
  // while rendering would make server and client HTML differ (hydration error).
  const [clipboardSupported, setClipboardSupported] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setClipboardSupported(!!navigator.clipboard);
    return () => clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  if (!clipboardSupported) return null;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Clipboard className="w-3.5 h-3.5" />}
      <span>{label}</span>
    </button>
  );
}
