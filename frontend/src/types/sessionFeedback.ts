export type SessionFeedbackPayload = {
  session_id: string;
  smoothness_response: string;
  desired_features: string | null;
  question_relevance_response: string;
  feedback_helpfulness_response: string;
  feedback_specificity_response: string | null;
  bug_report: string | null;
  pay_likelihood_response: string;
  overall_satisfaction_rating: number;
  ease_of_use_rating: number;
  question_quality_rating: number;
  feedback_actionability_rating: number;
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
