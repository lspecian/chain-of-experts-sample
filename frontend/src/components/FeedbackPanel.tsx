import React, { useState } from 'react';
import './FeedbackPanel.css';

interface FeedbackPanelProps {
  traceId: string;
  onFeedbackSubmitted?: () => void;
  darkMode?: boolean;
}

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({ 
  traceId, 
  onFeedbackSubmitted,
  darkMode = false
}) => {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);
  
  const handleRatingClick = (value: number) => {
    setRating(value);
  };
  
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setComment(e.target.value);
  };
  
  const handleSubmit = async () => {
    if (rating === null) {
      setError('Please select a rating before submitting');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          traceId,
          scoreValue: rating,
          comment: comment.trim() || undefined,
          scoreName: 'user-satisfaction'
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      setSubmitted(true);
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while submitting feedback');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (submitted) {
    return (
      <div className={`feedback-panel ${darkMode ? 'dark-mode' : ''}`}>
        <div className="feedback-success">
          <h4>Thank you for your feedback!</h4>
          <p>Your input helps us improve our system.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`feedback-panel ${darkMode ? 'dark-mode' : ''}`}>
      <h4>How helpful was this response?</h4>
      
      <div className="rating-buttons">
        <button 
          className={`rating-button ${rating === 1 ? 'selected' : ''}`}
          onClick={() => handleRatingClick(1)}
          title="Not helpful"
        >
          👎
        </button>
        <button 
          className={`rating-button ${rating === 3 ? 'selected' : ''}`}
          onClick={() => handleRatingClick(3)}
          title="Somewhat helpful"
        >
          😐
        </button>
        <button 
          className={`rating-button ${rating === 5 ? 'selected' : ''}`}
          onClick={() => handleRatingClick(5)}
          title="Very helpful"
        >
          👍
        </button>
      </div>
      
      <div className="feedback-comment">
        <label htmlFor="feedback-comment">Additional comments (optional):</label>
        <textarea
          id="feedback-comment"
          value={comment}
          onChange={handleCommentChange}
          placeholder="Tell us what worked well or how we can improve..."
          rows={3}
        />
      </div>
      
      {error && <div className="feedback-error">{error}</div>}
      
      <button 
        className="submit-button"
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </div>
  );
};

export default FeedbackPanel;