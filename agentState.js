// Создаём новую память при запуске. Ответы инструментов храним в одном месте.
function createAgentState(goal) {
  return {
    goal,
    step: 0,
    knownStudents: null,
    analyzedStudents: [],
    toolResults: [],
    pendingActions: [],
    completedActions: [],
    finalFindings: null,
  };
}
module.exports = { createAgentState };
