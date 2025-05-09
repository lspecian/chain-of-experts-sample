import React, { useState } from 'react';

interface CopyButtonProps {
  textToCopy: string;
  darkMode?: boolean;
  label?: string;
  className?: string;
}

const CopyButton: React.FC<CopyButtonProps> = ({
  textToCopy,
  darkMode = false,
  label = "Copy",
  className = ""
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
      })
      .catch(err => {
        console.error('Failed to copy:', err);
        // Optionally, provide user feedback about the error
      });
  };

  return (
    <button
      className={`copy-button ${className} ${darkMode ? 'dark' : ''}`}
      onClick={handleCopy}
      aria-label={copied ? "Copied!" : label}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
};

export default CopyButton;