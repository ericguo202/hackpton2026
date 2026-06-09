export type SessionFeedbackPayload = {
  // null for voluntary (launcher) feedback not tied to a session.
  session_id: string | null;
  smoothness_rating: number;
  desired_features: string | null;
  difficult_feature_response: string | null;
  question_relevance_response: string;
  feedback_helpfulness_response: string;
  bug_report: string | null;
  overall_satisfaction_rating: number;
  question_quality_rating: number;
  would_recommend_rating: number;
  willing_to_pay: boolean;
  monthly_price: string | null;
  paid_feature_request: string | null;
};

export type SessionFeedbackResponse = SessionFeedbackPayload & {
  id: string;
  user_id: string;
  created_at: string;
};

/**
 * Gate status for the forced beta-feedback modal (GET /session-feedback/required).
 * `session_id` is the completed session the forced submission attaches to;
 * null when feedback isn't required.
 */
export type FeedbackRequiredResponse = {
  required: boolean;
  session_id: string | null;
};
