export const promptTemplates = {
  retry:
    "You stopped making concrete progress. Continue from the last successful step, state the next 3 actions, and do not stop until the requested deliverable is complete.",
  scopeReminder:
    "Re-read the task and produce only the requested deliverables. Do not substitute commentary for completion.",
  deliverableChecklist:
    "Before you claim completion, explicitly confirm each requested deliverable and where it appears.",
  verification:
    "Review the primary worker's output against the rubric. Identify omissions, unsupported claims, contradictions, and whether the task is actually complete."
} as const;
