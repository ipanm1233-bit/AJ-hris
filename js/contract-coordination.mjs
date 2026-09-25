export function summarizeReviewTasks(tasks, evaluationId) {
  const relevant = tasks.filter(task => task.evaluation_id === evaluationId);
  const completed = relevant.filter(task => String(task.status || "").toUpperCase() === "DONE");
  const scores = completed
    .filter(task => task.skor_akhir !== null && task.skor_akhir !== undefined && task.skor_akhir !== "")
    .map(task => Number(task.skor_akhir)).filter(Number.isFinite);
  return {
    tasks: relevant,
    completed: completed.length,
    average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    ready: relevant.length > 0 && completed.length === relevant.length && scores.length === relevant.length
  };
}

export function resolveCoordinationStage({ finished, reviewReady, recommendation, reviewDate, evidence, supervisorName, supervisorDecision, supervisorDate, gmDate, directorDate, directorDecision }) {
  if (finished) return "SELESAI";
  if (!reviewReady || !recommendation || !reviewDate || String(evidence || "").trim().length < 12) return "REVIEW_HRD";
  if (!supervisorName || supervisorDecision !== "SETUJU" || !supervisorDate || !gmDate) return "KOORDINASI_GM";
  if (directorDate && directorDecision && directorDecision !== "PENDING") return "DRAFT_KONTRAK";
  return "APPROVAL_DIREKTUR";
}
