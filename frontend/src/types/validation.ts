// Mirrors backend/app/schemas/validation.py::SuggestionsOut.
export type Suggestions = {
  suggestions: string[];
  flagged: boolean;
  message: string | null;
};
