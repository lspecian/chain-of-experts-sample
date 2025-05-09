import React from 'react';
import { CopyButton } from './index'; // Import CopyButton

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
  const rawJsonString = JSON.stringify(data, null, 2);

  return (
    <div className={`raw-tab ${darkMode ? 'dark' : 'light'}`}>
      <h3>Raw Response</h3>
      <div className="copy-button-container">
        <CopyButton
          textToCopy={rawJsonString}
          darkMode={darkMode}
          label="Copy JSON to Clipboard"
        />
      </div>
      <pre className="raw-json">{rawJsonString}</pre>
    </div>
  );
};

export default RawResponseView;