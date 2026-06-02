export type CellData = {
  succeed: boolean | null;
  attempts: number;
  status: "recorded" | "missing";
};

export type ProblemSummary = {
  problem_type: string;
  solution_space_size: number | null;
  stop_reason: string;
  is_solution_space_complete?: boolean | null;
  runtime_sec?: number | null;
};

export type TableRow = {
  family: string;
  problem_id: string;
  summary: ProblemSummary | null;
  cells: Record<string, CellData>;
};

export type AttemptCode = {
  attempt: number;
  code: string | null;
  exec_status?: string;
  observed_label?: string;
  error_summary?: string;
};

export type ProblemDetail = {
  id: string;
  family: string;
  summary?: ProblemSummary | null;
  description: string;
  model: string;
  decision_variables: string[];
  example_instance: string;
  example_solution: unknown;
  language: string;
  label: string;
  generation: {
    succeed: boolean | null;
    attempts: number | null;
    generator_llm: string | null;
  };
  generated_codes: {
    llm: string | null;
    attempts: AttemptCode[];
    final_code: string | null;
    attempts_used?: number;
    final_observed_label?: string;
  };
};

export type Meta = {
  languages: string[];
  labels: string[];
};
