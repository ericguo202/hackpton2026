export type SessionFeedbackPayload = {
  session_id: string;
  smoothness_rating: number;
  desired_features: string | null;
  question_relevance_rating: number;
  feedback_helpfulness_rating: number;
  feedback_specificity: string | null;
  bug_report: string | null;
  pay_likelihood_rating: number;
  willing_to_pay: boolean;
  monthly_price: string | null;
  paid_feature_request: string | null;
};

export type SessionFeedbackResponse = SessionFeedbackPayload & {
  id: string;
  user_id: string;
  created_at: string;
};
