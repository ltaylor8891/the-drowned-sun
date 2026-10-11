// Pure quest progress. A quest is a list of steps; each step is done when its flag is set.
export function questProgress(quest, flags) {
  const steps = quest.steps.map((s) => ({ text: s.text, done: !!flags[s.flag] }));
  const current = steps.findIndex((s) => !s.done);
  return { steps, current, complete: current === -1 };
}

// Started, in-progress quests (main quests first).
export function activeQuests(quests, flags) {
  return Object.entries(quests)
    .filter(([, q]) => !q.startFlag || flags[q.startFlag])
    .map(([id, quest]) => ({ id, quest, ...questProgress(quest, flags) }))
    .filter((q) => !q.complete)
    .sort((a, b) => (a.quest.type === 'main' ? 0 : 1) - (b.quest.type === 'main' ? 0 : 1));
}
