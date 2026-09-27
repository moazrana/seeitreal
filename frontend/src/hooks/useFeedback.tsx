import { useCallback, useState } from 'react';
import { FeedbackDialog } from '../components/FeedbackDialog';
import type { FeedbackOptions } from '../components/FeedbackDialog';

/** `showFeedback({ tone, title, message })`; render `feedbackDialog` once. */
export function useFeedback() {
  const [options, setOptions] = useState<FeedbackOptions | null>(null);
  const showFeedback = useCallback((next: FeedbackOptions) => setOptions(next), []);
  const feedbackDialog = options ? (
    <FeedbackDialog {...options} onClose={() => setOptions(null)} />
  ) : null;
  return { showFeedback, feedbackDialog };
}
