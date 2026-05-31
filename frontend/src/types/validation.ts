export type ValidationStatus =
  | 'valid'
  | 'needs_confirmation'
  | 'invalid'
  | 'unavailable';

export type RoleAlternative = {
  title: string;
  soc_code: string | null;
  confidence: number;
};

export type RoleValidation = {
  status: ValidationStatus;
  user_input: string;
  canonical_title: string | null;
  soc_code: string | null;
  category: string | null;
  source: string | null;
  confidence: number;
  alternatives: RoleAlternative[];
  message: string | null;
};

export type IndustryAlternative = {
  name: string;
  confidence: number;
};

export type IndustryValidation = {
  status: ValidationStatus;
  user_input: string;
  canonical_industry: string | null;
  category: string | null;
  source: string | null;
  confidence: number;
  alternatives: IndustryAlternative[];
  message: string | null;
};

export type CompanyAlternative = {
  name: string;
  domain: string | null;
  brand_id: string | null;
  confidence: number;
};

export type CompanyValidation = {
  status: ValidationStatus;
  user_input: string;
  canonical_name: string | null;
  domain: string | null;
  brand_id: string | null;
  source: string | null;
  confidence: number;
  alternatives: CompanyAlternative[];
  message: string | null;
};
