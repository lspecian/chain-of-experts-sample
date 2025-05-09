import React from 'react';

interface RawResponseViewProps {
  data: unknown;
  darkMode?: boolean;
}

/**
 * RawResponseView component displays the raw JSON response data
 * with copy-to-clipboard functionality
 */
const RawResponseView: React.FC<RawResponseViewProps> = ({ 
  data, 
  darkMode = false 
}) => {
  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      .then(() => {
        // Could add a toast notification here in the future
        console.log('Copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
  };

  return (
    <div className={`raw-tab ${darkMode ? 'dark' : 'light'}`}>
      <h3>Raw Response</h3>
      <div className="copy-button-container">
        <button 
          className="copy-button"
          onClick={handleCopyToClipboard}
          aria-label="Copy to clipboard"
        >
          Copy to Clipboard
        </button>
      </div>
      <pre className="raw-json">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
};

export default RawResponseView;