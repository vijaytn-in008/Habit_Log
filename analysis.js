/* ============================================================
   Behavior Log — Analysis Module (v7 — Growth vs Quit Differentiation)
   Pure functions that take raw log arrays and return structured
   behavioral observations organized into five key questions.

   Design principles:
   - Minimum sample sizes enforced (MIN_SAMPLE)
   - Correlation-not-causation language throughout
   - Natural-language observations with supporting evidence
   - Growth habits: what helps success, what causes partial, what replaces skips
   - Quit habits: triggers, resistance strategies, before-activity, urge patterns
   - Handles Done / Partially Done / Skipped / Extended statuses
   - Uses behavioral fields (previousActivity, alternativeActivity,
     interruption, place, duration, completedWork, remainingWork,
     problemsFaced, outcome, trigger, beforeActivity, resistActivity, urgeCount)
   ============================================================ */

'use strict';

const MIN_SAMPLE = 5; // Minimum logs before showing statistical insight
const MIN_TREND  = 3; // Minimum logs per period for trend comparison
const MIN_PATTERN = 2; // Minimum occurrences to show a pattern

// ============================================================
// Main Entry Point — Five-Question Reflection
// ============================================================

const _reflectionCache = new Map();

/**
 * Clear the reflection cache.
 */
function clearReflectionCache() {
  _reflectionCache.clear();
}

/**
 * Generate a structured reflection organized into five questions.
 * @param {Array} logs — full log array
 * @param {Array} habits — habit items from IndexedDB
 * @param {Array} tasks — task items from IndexedDB
 * @returns {{ whatHelps: Array, whatBlocksYou: Array, whereBest: Array, whereBreaksDown: Array, whatIsChanging: Array }}
 */
function generateReflection(logs, habits, tasks) {
  if (!logs || logs.length === 0) {
    return {
      whatHelps: [],
      whatBlocksYou: [],
      whereBest: [],
      whereBreaksDown: [],
      whatIsChanging: [],
      summary: { total: 0, done: 0, partial: 0, skipped: 0 }
    };
  }

  const cacheKey = `all_${logs.length}_${logs[0]?.id || 0}_${logs[logs.length - 1]?.id || 0}`;
  if (_reflectionCache.has(cacheKey)) {
    return _reflectionCache.get(cacheKey);
  }

  const doneLogs  = logs.filter(l => l.status === 'Done');
  const partialLogs = logs.filter(l => l.status === 'Partially Done');
  const skippedLogs = logs.filter(l => l.status === 'Skipped');

  // Summary stats
  const summary = {
    total: logs.length,
    done: doneLogs.length,
    partial: partialLogs.length,
    skipped: skippedLogs.length,
    thisWeekDone: logsInLastDays(doneLogs, 7).length,
    thisWeekPartial: logsInLastDays(partialLogs, 7).length
  };

  const result = {
    whatHelps: analyzeWhatHelps(logs, habits, tasks),
    whatBlocksYou: analyzeWhatBlocksYou(logs, habits),
    whereBest: analyzeWhereBest(logs, habits, tasks),
    whereBreaksDown: analyzeWhereBreaksDown(logs, tasks),
    whatIsChanging: analyzeWhatIsChanging(logs, habits, tasks),
    summary
  };

  _reflectionCache.set(cacheKey, result);
  return result;
}

/**
 * Generate a five-question reflection for a single item.
 * @param {Array}  logs — all logs
 * @param {string} itemName — specific habit or task name
 * @param {Array}  habits — habit items
 * @param {Array}  tasks — task items
 * @returns {Object} same structure as generateReflection
 */
function generateItemReflection(logs, itemName, habits, tasks) {
  const cacheKey = `item_${itemName}_${logs.length}_${logs[0]?.id || 0}_${logs[logs.length - 1]?.id || 0}`;
  if (_reflectionCache.has(cacheKey)) {
    return _reflectionCache.get(cacheKey);
  }

  const isTask = logs.some(l => l.name === itemName && (l.type === 'Task' || l.type === 'Subtask' || l.type === 'NextAction'));
  const itemType = isTask ? 'Task' : 'Habit';
  const itemLogs = logs.filter(l =>
    l.name === itemName ||
    l.parentTaskName === itemName ||
    l.subtaskName === itemName
  );

  if (itemLogs.length === 0) {
    const emptyResult = {
      whatHelps: [],
      whatBlocksYou: [],
      whereBest: [],
      whereBreaksDown: [],
      whatIsChanging: [],
      summary: { total: 0, done: 0, partial: 0, skipped: 0 },
      itemName,
      itemType
    };
    _reflectionCache.set(cacheKey, emptyResult);
    return emptyResult;
  }

  const habitItem = (habits || []).find(h => h.name === itemName);
  const isQuitHabit = habitItem && habitItem.behaviorType === 'Bad';
  const doneLabel = isQuitHabit ? 'resisted' : 'completed';

  const doneLogs = itemLogs.filter(l => l.status === 'Done');
  const partialLogs = itemLogs.filter(l => l.status === 'Partially Done');
  const skippedLogs = itemLogs.filter(l => l.status === 'Skipped');

  const summary = {
    total: itemLogs.length,
    done: doneLogs.length,
    partial: partialLogs.length,
    skipped: skippedLogs.length,
    doneLabel,
    isQuitHabit,
    itemType
  };

  // Streak
  const streak = calculateStreak(itemLogs);
  summary.currentStreak = streak.current;
  summary.bestStreak = streak.best;

  // For quit habits, use dedicated analysis functions
  const result = isQuitHabit ? {
    whatHelps: analyzeQuitWhatHelps(itemLogs, doneLogs, partialLogs, itemName),
    whatBlocksYou: analyzeQuitWhatBlocks(itemLogs, partialLogs, skippedLogs, itemName),
    whereBest: analyzeQuitWhereBest(itemLogs, doneLogs, partialLogs, skippedLogs, itemName),
    whereBreaksDown: analyzeQuitWhereBreaksDown(itemLogs, partialLogs, skippedLogs, itemName),
    whatIsChanging: analyzeItemWhatIsChanging(itemLogs, doneLabel, itemName),
    summary,
    itemName,
    itemType: 'Habit'
  } : {
    whatHelps: analyzeItemWhatHelps(itemLogs, doneLogs, doneLabel, itemName, habits, logs),
    whatBlocksYou: analyzeItemWhatBlocks(itemLogs, partialLogs, skippedLogs, itemName),
    whereBest: analyzeItemWhereBest(itemLogs, doneLogs, partialLogs, skippedLogs, doneLabel, itemName),
    whereBreaksDown: analyzeItemWhereBreaksDown(itemLogs, partialLogs, skippedLogs, itemName, tasks),
    whatIsChanging: analyzeItemWhatIsChanging(itemLogs, doneLabel, itemName),
    summary,
    itemName,
    itemType: isTask ? 'Task' : 'Habit'
  };

  _reflectionCache.set(cacheKey, result);
  return result;
}

// ============================================================
// Question 1: What Helps Me?
// ============================================================

function analyzeWhatHelps(logs, habits, tasks) {
  const observations = [];
  const doneLogs = logs.filter(l => l.status === 'Done');
  const habitItems = habits || [];

  if (doneLogs.length < MIN_SAMPLE) {
    return [];
  }

  // Previous activities that precede success (growth habits)
  const growthDoneLogs = doneLogs.filter(l => {
    const h = habitItems.find(hi => hi.name === l.name);
    return l.type === 'Habit' && (!h || h.behaviorType !== 'Bad');
  });
  if (growthDoneLogs.length >= MIN_PATTERN) {
    const prevActs = topActivities(growthDoneLogs, 'beforeActivity');
    prevActs.slice(0, 3).forEach(a => {
      observations.push({
        text: `"${a.activity}" was recorded before successful execution.`,
        evidence: `Preceded ${a.count} of ${growthDoneLogs.length} completions`,
        tone: 'positive'
      });
    });

    // Physical state patterns in successful growth sessions
    const physDone = topActivities(growthDoneLogs, 'physicalState');
    physDone.slice(0, 2).forEach(p => {
      observations.push({
        text: `Physical state "${p.activity}" was recorded before successful execution.`,
        evidence: `Recorded in ${p.count} of ${growthDoneLogs.length} completions`,
        tone: 'positive'
      });
    });

    // Mental state patterns in successful growth sessions
    const mentDone = topActivities(growthDoneLogs, 'mentalState');
    mentDone.slice(0, 2).forEach(m => {
      observations.push({
        text: `Mental state "${m.activity}" was recorded before successful execution.`,
        evidence: `Recorded in ${m.count} of ${growthDoneLogs.length} completions`,
        tone: 'positive'
      });
    });
  }

  // Habit chains — rate comparison analysis
  habitItems.forEach(h => {
    if (!h.prevHabit) return;
    const habitLogs = logs.filter(l => l.name === h.name && l.type === 'Habit');
    const prevHabitLogs = logs.filter(l => l.name === h.prevHabit && l.type === 'Habit');
    if (habitLogs.length < MIN_SAMPLE || prevHabitLogs.length < MIN_PATTERN) return;

    const overallDoneCount = habitLogs.filter(l => l.status === 'Done').length;
    const overallRate = pct(overallDoneCount, habitLogs.length);

    // Days when prevHabit was completed
    const prevDoneDates = new Set(prevHabitLogs.filter(l => l.status === 'Done').map(l => l.date));
    // Habit logs on days when prevHabit was done
    const afterPrevLogs = habitLogs.filter(l => prevDoneDates.has(l.date));
    if (afterPrevLogs.length < MIN_PATTERN) return;
    const afterPrevDone = afterPrevLogs.filter(l => l.status === 'Done').length;
    const afterPrevRate = pct(afterPrevDone, afterPrevLogs.length);

    if (afterPrevRate > overallRate && (afterPrevRate - overallRate) >= 10) {
      observations.push({
        text: `${h.prevHabit} appears before ${afterPrevDone} of ${afterPrevLogs.length} successful ${h.name} sessions.`,
        evidence: `${h.name} after ${h.prevHabit}: ${afterPrevRate}% | Overall: ${overallRate}%`,
        tone: 'positive'
      });
    }
  });

  // Quit habit resistance strategies & replacement activity
  const quitDoneLogs = doneLogs.filter(l => {
    const h = habitItems.find(hi => hi.name === l.name);
    return l.type === 'Habit' && h && h.behaviorType === 'Bad';
  });
  if (quitDoneLogs.length >= MIN_PATTERN) {
    const replLogs = quitDoneLogs.filter(l => l.usedReplacementAction === 'Yes' || (l.replacementAction && l.action && l.action.toLowerCase() === l.replacementAction.toLowerCase()));
    if (replLogs.length >= MIN_PATTERN) {
      observations.push({
        text: `Resistance was recorded more often when replacement activities were used.`,
        evidence: `Replacement activity was recorded in ${replLogs.length} of ${quitDoneLogs.length} resisted sessions`,
        tone: 'positive'
      });
    }

    const beforeResist = topActivities(quitDoneLogs, 'beforeActivity');
    beforeResist.slice(0, 2).forEach(a => {
      observations.push({
        text: `"${a.activity}" was recorded before urge resistance.`,
        evidence: `Preceded ${a.count} of ${quitDoneLogs.length} resisted sessions`,
        tone: 'positive'
      });
    });

    const physResist = topActivities(quitDoneLogs, 'physicalState');
    physResist.slice(0, 2).forEach(p => {
      observations.push({
        text: `Physical state "${p.activity}" was recorded during urge resistance.`,
        evidence: `Recorded in ${p.count} of ${quitDoneLogs.length} resisted sessions`,
        tone: 'positive'
      });
    });

    const mentResist = topActivities(quitDoneLogs, 'mentalState');
    mentResist.slice(0, 2).forEach(m => {
      observations.push({
        text: `Mental state "${m.activity}" was recorded during urge resistance.`,
        evidence: `Recorded in ${m.count} of ${quitDoneLogs.length} resisted sessions`,
        tone: 'positive'
      });
    });

    const resistActs = topActivities(quitDoneLogs, 'resistActivity');
    resistActs.slice(0, 2).forEach(a => {
      observations.push({
        text: `"${a.activity}" was recorded during successful urge resistance.`,
        evidence: `Used in ${a.count} successful resistance${a.count > 1 ? 's' : ''}`,
        tone: 'positive'
      });
    });
  }

  // Place correlation with success
  const placeDoneLogs = doneLogs.filter(l => l.place && l.place.trim());
  if (placeDoneLogs.length >= MIN_SAMPLE) {
    const placeStats = {};
    placeDoneLogs.forEach(l => {
      const place = l.place.trim().toLowerCase();
      placeStats[place] = (placeStats[place] || 0) + 1;
    });
    const topPlace = Object.entries(placeStats).sort((a, b) => b[1] - a[1])[0];
    if (topPlace && topPlace[1] >= MIN_PATTERN) {
      observations.push({
        text: `Successful sessions were more common at "${topPlace[0]}".`,
        evidence: `${topPlace[1]} of ${placeDoneLogs.length} completions recorded at this place`,
        tone: 'positive'
      });
    }
  }

  // Priority correlation
  const priorityGroups = {};
  logs.forEach(l => {
    if (l.priority) {
      if (!priorityGroups[l.priority]) priorityGroups[l.priority] = { done: 0, total: 0 };
      priorityGroups[l.priority].total++;
      if (l.status === 'Done') priorityGroups[l.priority].done++;
    }
  });

  Object.entries(priorityGroups)
    .filter(([_, s]) => s.total >= MIN_SAMPLE)
    .forEach(([priority, stats]) => {
      const rate = pct(stats.done, stats.total);
      if (rate >= 65) {
        observations.push({
          text: `"${priority}" items were completed more often.`,
          evidence: `${rate}% completion rate (${stats.done} of ${stats.total})`,
          tone: 'positive'
        });
      }
    });

  return observations;
}

function analyzeItemWhatHelps(itemLogs, doneLogs, doneLabel, itemName, habits, allLogs) {
  const observations = [];

  if (doneLogs.length < MIN_PATTERN) {
    return [];
  }

  // Previous activities before success
  const prevActs = topActivities(doneLogs, 'beforeActivity');
  prevActs.slice(0, 3).forEach(a => {
    const totalDone = doneLogs.length;
    observations.push({
      text: `"${a.activity}" was recorded before ${doneLabel} sessions of ${itemName}.`,
      evidence: `${a.count} of ${totalDone} ${doneLabel} sessions`,
      tone: 'positive',
      itemName
    });
  });

  // Physical state before success
  const physDone = topActivities(doneLogs, 'physicalState');
  physDone.slice(0, 2).forEach(p => {
    observations.push({
      text: `Physical state "${p.activity}" was recorded before ${doneLabel} sessions of ${itemName}.`,
      evidence: `Recorded in ${p.count} of ${doneLogs.length} ${doneLabel} sessions`,
      tone: 'positive',
      itemName
    });
  });

  // Mental state before success
  const mentDone = topActivities(doneLogs, 'mentalState');
  mentDone.slice(0, 2).forEach(m => {
    observations.push({
      text: `Mental state "${m.activity}" was recorded before ${doneLabel} sessions of ${itemName}.`,
      evidence: `Recorded in ${m.count} of ${doneLogs.length} ${doneLabel} sessions`,
      tone: 'positive',
      itemName
    });
  });

  // Habit chain analysis for this specific item
  const habitItem = (habits || []).find(h => h.name === itemName);
  if (habitItem && habitItem.prevHabit && allLogs) {
    const prevHabitLogs = allLogs.filter(l => l.name === habitItem.prevHabit && l.type === 'Habit');
    if (prevHabitLogs.length >= MIN_PATTERN) {
      const overallRate = pct(doneLogs.length, itemLogs.length);
      const prevDoneDates = new Set(prevHabitLogs.filter(l => l.status === 'Done').map(l => l.date));
      const afterPrevLogs = itemLogs.filter(l => prevDoneDates.has(l.date));
      if (afterPrevLogs.length >= MIN_PATTERN) {
        const afterPrevDone = afterPrevLogs.filter(l => l.status === 'Done').length;
        const afterPrevRate = pct(afterPrevDone, afterPrevLogs.length);
        if (afterPrevRate > overallRate && (afterPrevRate - overallRate) >= 10) {
          observations.push({
            text: `${itemName} was ${doneLabel} in ${afterPrevRate}% of sessions after ${habitItem.prevHabit}, compared with ${overallRate}% overall.`,
            evidence: `${afterPrevDone} of ${afterPrevLogs.length} sessions after ${habitItem.prevHabit}`,
            tone: 'positive',
            itemName
          });
        }
      }
    }
  }

  // Place correlation for this item
  const placeLogs = doneLogs.filter(l => l.place && l.place.trim());
  if (placeLogs.length >= MIN_PATTERN) {
    const placeStats = {};
    placeLogs.forEach(l => {
      const place = l.place.trim().toLowerCase();
      placeStats[place] = (placeStats[place] || 0) + 1;
    });
    const topPlace = Object.entries(placeStats).sort((a, b) => b[1] - a[1])[0];
    if (topPlace && topPlace[1] >= MIN_PATTERN) {
      observations.push({
        text: `${itemName} was ${doneLabel} more often at "${topPlace[0]}".`,
        evidence: `${topPlace[1]} of ${placeLogs.length} sessions`,
        tone: 'positive',
        itemName
      });
    }
  }

  return observations;
}

// ============================================================
// Question 2: What Gets in My Way?
// ============================================================

function analyzeWhatBlocksYou(logs, habits) {
  const observations = [];
  const habitItems = habits || [];
  const failLogs = logs.filter(l => l.status === 'Skipped' || l.status === 'Partially Done');

  if (failLogs.length < MIN_PATTERN) {
    return [];
  }

  // Growth Habits — Partial Execution Analysis
  const growthPartialLogs = logs.filter(l => {
    const h = habitItems.find(hi => hi.name === l.name);
    return l.status === 'Partially Done' && l.type === 'Habit' && (!h || h.behaviorType !== 'Bad');
  });
  if (growthPartialLogs.length >= MIN_PATTERN) {
    const beforePartial = topActivities(growthPartialLogs, 'beforeActivity');
    beforePartial.slice(0, 2).forEach(a => {
      observations.push({
        text: `"${a.activity}" was recorded before partially completed sessions.`,
        evidence: `Preceded ${a.count} of ${growthPartialLogs.length} partial sessions`,
        tone: 'warning'
      });
    });

    const fallbackLogs = growthPartialLogs.filter(l => l.usedFallback === 'Yes' || (l.fallbackAction && l.action && l.action.toLowerCase() === l.fallbackAction.toLowerCase()));
    if (fallbackLogs.length >= MIN_PATTERN) {
      observations.push({
        text: `Fallback action was used in ${fallbackLogs.length} of ${growthPartialLogs.length} partial sessions, enabling partial completion instead of skipping.`,
        evidence: `${fallbackLogs.length} partial completions using fallback`,
        tone: 'positive'
      });
    }

    const physPartial = topActivities(growthPartialLogs, 'physicalState');
    physPartial.slice(0, 2).forEach(p => {
      observations.push({
        text: `Physical state "${p.activity}" was recorded during partial sessions.`,
        evidence: `Recorded in ${p.count} of ${growthPartialLogs.length} partial sessions`,
        tone: 'warning'
      });
    });

    const mentPartial = topActivities(growthPartialLogs, 'mentalState');
    mentPartial.slice(0, 2).forEach(m => {
      observations.push({
        text: `Mental state "${m.activity}" was recorded during partial sessions.`,
        evidence: `Recorded in ${m.count} of ${growthPartialLogs.length} partial sessions`,
        tone: 'warning'
      });
    });
  }

  // Growth Habits — Skipped Analysis
  const growthSkippedLogs = logs.filter(l => {
    const h = habitItems.find(hi => hi.name === l.name);
    return l.status === 'Skipped' && l.type === 'Habit' && (!h || h.behaviorType !== 'Bad');
  });
  if (growthSkippedLogs.length >= MIN_PATTERN) {
    const beforeSkip = topActivities(growthSkippedLogs, 'beforeActivity');
    beforeSkip.slice(0, 3).forEach(a => {
      observations.push({
        text: `Skipping occurred more often after "${a.activity}".`,
        evidence: `Among ${growthSkippedLogs.length} skipped sessions, ${a.count} occurred after this activity`,
        tone: 'warning'
      });
    });

    const altActs = topActivities(growthSkippedLogs, 'alternativeActivity');
    altActs.slice(0, 3).forEach(a => {
      observations.push({
        text: `"${a.activity}" was recorded when plans were skipped.`,
        evidence: `Appeared in ${a.count} skipped sessions`,
        tone: 'warning'
      });
    });

    const skipPhys = topActivities(growthSkippedLogs, 'physicalState');
    skipPhys.slice(0, 2).forEach(p => {
      observations.push({
        text: `Physical state "${p.activity}" was recorded when skipping occurred.`,
        evidence: `Recorded in ${p.count} of ${growthSkippedLogs.length} skipped sessions`,
        tone: 'warning'
      });
    });

    const skipMent = topActivities(growthSkippedLogs, 'mentalState');
    skipMent.slice(0, 2).forEach(m => {
      observations.push({
        text: `Mental state "${m.activity}" was recorded when skipping occurred.`,
        evidence: `Recorded in ${m.count} of ${growthSkippedLogs.length} skipped sessions`,
        tone: 'warning'
      });
    });
  }

  // Quit Habits — Occurred (Skipped) & Partial Resistance Analysis
  const quitOccurredLogs = logs.filter(l => {
    const h = habitItems.find(hi => hi.name === l.name);
    return l.status === 'Skipped' && l.type === 'Habit' && h && h.behaviorType === 'Bad';
  });
  if (quitOccurredLogs.length >= MIN_PATTERN) {
    const quitBefore = topActivities(quitOccurredLogs, 'beforeActivity');
    quitBefore.slice(0, 3).forEach(a => {
      observations.push({
        text: `Quit behavior occurred more often after "${a.activity}".`,
        evidence: `Among ${quitOccurredLogs.length} logged sessions, ${a.count} occurred after this activity`,
        tone: 'negative'
      });
    });

    const qPhys = topActivities(quitOccurredLogs, 'physicalState');
    qPhys.slice(0, 2).forEach(p => {
      observations.push({
        text: `Physical state "${p.activity}" was recorded when quit behavior occurred.`,
        evidence: `Recorded in ${p.count} of ${quitOccurredLogs.length} occurrences`,
        tone: 'negative'
      });
    });

    const qMent = topActivities(quitOccurredLogs, 'mentalState');
    qMent.slice(0, 2).forEach(m => {
      observations.push({
        text: `Mental state "${m.activity}" was recorded when quit behavior occurred.`,
        evidence: `Recorded in ${m.count} of ${quitOccurredLogs.length} occurrences`,
        tone: 'negative'
      });
    });
  }

  // Common interruptions
  const interruptions = topActivities(logs.filter(l => l.status === 'Partially Done'), 'interruption');
  interruptions.slice(0, 2).forEach(a => {
    observations.push({
      text: `"${a.activity}" was recorded as an interruption during partial sessions.`,
      evidence: `${a.count} time${a.count > 1 ? 's' : ''}`,
      tone: 'warning'
    });
  });

  // Recurring problems
  const problemLogs = logs.filter(l => l.problemsFaced && l.problemsFaced.trim());
  if (problemLogs.length >= MIN_PATTERN) {
    const problems = topActivities(problemLogs, 'problemsFaced');
    problems.slice(0, 2).forEach(a => {
      observations.push({
        text: `"${a.activity}" appeared as a problem in logged sessions.`,
        evidence: `Logged ${a.count} time${a.count > 1 ? 's' : ''}`,
        tone: 'negative'
      });
    });
  }

  return observations;
}

function analyzeItemWhatBlocks(itemLogs, partialLogs, skippedLogs, itemName) {
  const observations = [];

  // Partial execution analysis for this item
  if (partialLogs.length >= MIN_PATTERN) {
    const beforePartial = topActivities(partialLogs, 'beforeActivity');
    beforePartial.slice(0, 2).forEach(a => {
      observations.push({
        text: `"${a.activity}" was recorded before partially completed sessions of ${itemName}.`,
        evidence: `Preceded ${a.count} of ${partialLogs.length} partial sessions`,
        tone: 'warning',
        itemName
      });
    });

    const fallbackUsed = partialLogs.filter(l => l.usedFallback === 'Yes' || (l.fallbackAction && l.action && l.action.toLowerCase() === l.fallbackAction.toLowerCase()));
    if (fallbackUsed.length >= MIN_PATTERN) {
      observations.push({
        text: `Fallback action was used in ${fallbackUsed.length} of ${partialLogs.length} partial sessions, enabling partial completion instead of skipping.`,
        evidence: `${fallbackUsed.length} partial completions using fallback action`,
        tone: 'positive',
        itemName
      });
    }

    const physPartial = topActivities(partialLogs, 'physicalState');
    physPartial.slice(0, 2).forEach(p => {
      observations.push({
        text: `Physical state "${p.activity}" was recorded during partial sessions of ${itemName}.`,
        evidence: `Recorded in ${p.count} of ${partialLogs.length} partial sessions`,
        tone: 'warning',
        itemName
      });
    });

    const mentPartial = topActivities(partialLogs, 'mentalState');
    mentPartial.slice(0, 2).forEach(m => {
      observations.push({
        text: `Mental state "${m.activity}" was recorded during partial sessions of ${itemName}.`,
        evidence: `Recorded in ${m.count} of ${partialLogs.length} partial sessions`,
        tone: 'warning',
        itemName
      });
    });

    const interrupts = topActivities(partialLogs, 'interruption');
    interrupts.slice(0, 2).forEach(a => {
      observations.push({
        text: `"${a.activity}" interrupted ${itemName} during partial sessions.`,
        evidence: `${a.count} time${a.count > 1 ? 's' : ''}`,
        tone: 'warning',
        itemName
      });
    });
  }

  // Skipped analysis for this item
  if (skippedLogs.length >= MIN_PATTERN) {
    const beforeSkipped = topActivities(skippedLogs, 'beforeActivity');
    beforeSkipped.slice(0, 2).forEach(a => {
      observations.push({
        text: `Skipping of ${itemName} occurred more often after "${a.activity}".`,
        evidence: `Among ${skippedLogs.length} skipped sessions, ${a.count} occurred after this activity`,
        tone: 'warning',
        itemName
      });
    });

    const altActs = topActivities(skippedLogs, 'alternativeActivity');
    altActs.slice(0, 2).forEach(a => {
      observations.push({
        text: `When ${itemName} was skipped, "${a.activity}" was recorded instead.`,
        evidence: `${a.count} of ${skippedLogs.length} skipped sessions`,
        tone: 'warning',
        itemName
      });
    });

    const physSkipped = topActivities(skippedLogs, 'physicalState');
    physSkipped.slice(0, 2).forEach(p => {
      observations.push({
        text: `Physical state "${p.activity}" was recorded when ${itemName} was skipped.`,
        evidence: `Recorded in ${p.count} of ${skippedLogs.length} skipped sessions`,
        tone: 'warning',
        itemName
      });
    });

    const mentSkipped = topActivities(skippedLogs, 'mentalState');
    mentSkipped.slice(0, 2).forEach(m => {
      observations.push({
        text: `Mental state "${m.activity}" was recorded when ${itemName} was skipped.`,
        evidence: `Recorded in ${m.count} of ${skippedLogs.length} skipped sessions`,
        tone: 'warning',
        itemName
      });
    });
  }

  // Problems for this item
  const problems = topActivities(itemLogs.filter(l => l.problemsFaced && l.problemsFaced.trim()), 'problemsFaced');
  problems.slice(0, 2).forEach(a => {
    observations.push({
      text: `"${a.activity}" was recorded as a recurring problem for ${itemName}.`,
      evidence: `${a.count} time${a.count > 1 ? 's' : ''}`,
      tone: 'negative',
      itemName
    });
  });

  if (observations.length === 0 && (skippedLogs.length + partialLogs.length) < MIN_PATTERN) {
    return [];
  }

  return observations;
}

// ============================================================
// Question 3: Where Do I Perform Best?
// ============================================================

function analyzeWhereBest(logs, habits, tasks) {
  const observations = [];
  const doneLogs = logs.filter(l => l.status === 'Done');

  if (doneLogs.length < MIN_SAMPLE) {
    return [];
  }

  // Best day of week
  const bestDayResult = bestDay(doneLogs);
  if (bestDayResult) {
    observations.push({
      text: `You complete more items on ${bestDayResult.day} than any other day.`,
      evidence: `${bestDayResult.count} completions on ${bestDayResult.day}`,
      tone: 'positive'
    });
  }

  // Time-of-day analysis
  const timeSlots = analyzeTimeSlots(doneLogs);
  if (timeSlots.best) {
    observations.push({
      text: `Your completion rate appears highest in the ${timeSlots.best.slot.toLowerCase()}.`,
      evidence: `${timeSlots.best.count} completions during this time range`,
      tone: 'positive'
    });
  }

  // Place analysis
  const placeInsight = placeCorrelation(logs);
  if (placeInsight) {
    observations.push({
      text: placeInsight.text,
      evidence: placeInsight.evidence || '',
      tone: 'positive'
    });
  }

  // Per-item best completion rates
  if (logs.length >= MIN_SAMPLE) {
    const groups = groupByName(logs);
    const itemRates = Object.entries(groups)
      .filter(([_, entries]) => entries.length >= MIN_SAMPLE)
      .map(([name, entries]) => ({
        name,
        rate: pct(entries.filter(e => e.status === 'Done').length, entries.length),
        total: entries.length
      }))
      .filter(item => item.rate >= 70)
      .sort((a, b) => b.rate - a.rate);

    itemRates.slice(0, 3).forEach(item => {
      observations.push({
        text: `${item.name} has your highest completion rate.`,
        evidence: `${item.rate}% completed (${item.total} sessions)`,
        tone: 'positive',
        itemName: item.name
      });
    });
  }

  return observations;
}

function analyzeItemWhereBest(itemLogs, doneLogs, partialLogs, skippedLogs, doneLabel, itemName) {
  const observations = [];

  if (doneLogs.length < MIN_PATTERN) {
    return [];
  }

  // Best day of week for this item
  if (doneLogs.length >= MIN_SAMPLE) {
    const bestDayResult = habitBestDay(doneLogs);
    if (bestDayResult) {
      observations.push({
        text: `${itemName} was ${doneLabel} most often on ${bestDayResult.day}.`,
        evidence: `${bestDayResult.count} times on ${bestDayResult.day}`,
        tone: 'positive',
        itemName
      });
    }
  }

  // Time-of-day for this item
  const timeSlots = analyzeTimeSlots(doneLogs);
  if (timeSlots.best) {
    observations.push({
      text: `${itemName} was ${doneLabel} most in the ${timeSlots.best.slot.toLowerCase()}.`,
      evidence: `${timeSlots.best.count} sessions in this time range`,
      tone: 'positive',
      itemName
    });
  }

  // Worst time of day
  const failTimeSlots = analyzeTimeSlots(partialLogs.concat(skippedLogs));
  if (failTimeSlots.best && timeSlots.best && failTimeSlots.best.slot !== timeSlots.best.slot) {
    observations.push({
      text: `Skipped or partial sessions for ${itemName} were more common in the ${failTimeSlots.best.slot.toLowerCase()}.`,
      evidence: `${failTimeSlots.best.count} non-complete sessions in this range`,
      tone: 'warning',
      itemName
    });
  }

  // Overall rate
  const fullPct = pct(doneLogs.length, itemLogs.length);
  const engagePct = pct(doneLogs.length + partialLogs.length, itemLogs.length);
  observations.push({
    text: `${itemName} overall: ${fullPct}% fully ${doneLabel}, ${engagePct}% including partial.`,
    evidence: `${doneLogs.length} done, ${partialLogs.length} partial, ${skippedLogs.length} skipped out of ${itemLogs.length}`,
    tone: engagePct >= 70 ? 'positive' : engagePct >= 40 ? 'neutral' : 'negative',
    itemName
  });

  return observations;
}

// ============================================================
// Question 4: Where Does My Work Break Down?
// ============================================================

function analyzeWhereBreaksDown(logs, tasks) {
  const observations = [];
  const taskLogs = logs.filter(l => l.type === 'Task' || l.type === 'Subtask' || l.type === 'NextAction');
  const stuckLogs = logs.filter(l => l.status === 'Partially Done' || l.status === 'Skipped' || l.status === 'Extended');

  if (stuckLogs.length < MIN_PATTERN) {
    return [];
  }

  // Most skipped habit
  const habitLogs = logs.filter(l => l.type === 'Habit');
  if (habitLogs.length >= MIN_SAMPLE) {
    const skippedHabit = topByStatus(habitLogs, 'Skipped');
    if (skippedHabit && skippedHabit.pct > 0) {
      observations.push({
        text: `${skippedHabit.name} is your most frequently skipped habit.`,
        evidence: `Skipped ${skippedHabit.pct}% of the time (${skippedHabit.count} times)`,
        tone: 'warning',
        itemName: skippedHabit.name
      });
    }
  }

  // Most stuck tasks (high partial + skipped rate)
  if (taskLogs.length >= MIN_SAMPLE) {
    const taskGroups = groupByName(taskLogs);
    const stuckTasks = Object.entries(taskGroups)
      .filter(([_, entries]) => entries.length >= MIN_TREND)
      .map(([name, entries]) => {
        const stuck = entries.filter(e => e.status === 'Partially Done' || e.status === 'Skipped' || e.status === 'Extended').length;
        return { name, stuckRate: pct(stuck, entries.length), stuckCount: stuck, total: entries.length };
      })
      .filter(t => t.stuckRate >= 50)
      .sort((a, b) => b.stuckRate - a.stuckRate);

    stuckTasks.slice(0, 3).forEach(t => {
      observations.push({
        text: `${t.name} frequently faces friction — incomplete ${t.stuckRate}% of the time.`,
        evidence: `${t.stuckCount} of ${t.total} sessions were partial, skipped, or extended`,
        tone: 'warning',
        itemName: t.name
      });
    });
  }

  // Subtask & Next Action blocking patterns
  // Next Action factual execution patterns
  const nextActionLogs = logs.filter(l => l.type === 'NextAction' || l.subtaskName || l.action);
  if (nextActionLogs.length >= 3) {
    const actionGroups = {};
    nextActionLogs.forEach(l => {
      const pName = l.parentTaskName || '';
      const sName = l.action || l.subtaskName || l.name;
      const key = `${pName}:${sName}`;
      if (!actionGroups[key]) {
        actionGroups[key] = {
          name: sName,
          parent: pName,
          total: 0,
          done: 0,
          partial: 0,
          skipped: 0,
          altActivities: {},
          physicalStates: {},
          mentalStates: {},
          interruptions: {},
          places: {}
        };
      }
      const g = actionGroups[key];
      g.total++;
      if (l.status === 'Done') g.done++;
      else if (l.status === 'Partially Done') g.partial++;
      else if (l.status === 'Skipped') g.skipped++;

      if (l.alternativeActivity) {
        g.altActivities[l.alternativeActivity] = (g.altActivities[l.alternativeActivity] || 0) + 1;
      }
      if (l.physicalState) {
        g.physicalStates[l.physicalState] = (g.physicalStates[l.physicalState] || 0) + 1;
      }
      if (l.mentalState) {
        g.mentalStates[l.mentalState] = (g.mentalStates[l.mentalState] || 0) + 1;
      }
      if (l.interruption) {
        g.interruptions[l.interruption] = (g.interruptions[l.interruption] || 0) + 1;
      }
      if (l.place) {
        g.places[l.place] = (g.places[l.place] || 0) + 1;
      }
    });

    Object.values(actionGroups).forEach(g => {
      // 1. Partial completion factual observation
      if (g.partial > 0 && g.total >= 3) {
        observations.push({
          text: `"${g.name}" was partially completed in ${g.partial} of ${g.total} logged attempts.`,
          evidence: `${pct(g.partial, g.total)}% partial completion rate`,
          tone: 'neutral',
          itemName: g.parent || g.name
        });
      }

      // 2. Skipped alternative activity factual observation
      const topAlt = Object.entries(g.altActivities).sort((a, b) => b[1] - a[1])[0];
      if (topAlt && topAlt[1] >= 2) {
        observations.push({
          text: `"${topAlt[0]}" was recorded as the activity engaged in instead in ${topAlt[1]} skipped attempts.`,
          evidence: `${topAlt[1]} of ${g.skipped} skipped attempts involved ${topAlt[0]}`,
          tone: 'warning',
          itemName: g.parent || g.name
        });
      }

      // 3. Physical state factual observation
      const topPhys = Object.entries(g.physicalStates).sort((a, b) => b[1] - a[1])[0];
      if (topPhys && topPhys[1] >= 2 && (g.partial > 0 || g.skipped > 0)) {
        observations.push({
          text: `${topPhys[1]} partial/skipped attempts of "${g.name}" occurred when physical state was recorded as ${topPhys[0]}.`,
          evidence: `Recorded in ${topPhys[1]} of ${g.total} logged attempts`,
          tone: 'neutral',
          itemName: g.parent || g.name
        });
      }
    });
  } else if (nextActionLogs.length > 0 && nextActionLogs.length < 3) {
    observations.push({
      text: "Not enough data yet.",
      evidence: `${nextActionLogs.length} attempts recorded (minimum 3 required for trend observation)`,
      tone: 'neutral'
    });
  }

  // Deadline extensions (inspect both task/subtask metadata and logs)
  const taskExtensions = [];
  if (Array.isArray(tasks)) {
    tasks.forEach(t => {
      let extCount = Array.isArray(t.deadlineExtensions) ? t.deadlineExtensions.length : 0;
      let subtasksList = [];
      if (Array.isArray(t.subtasks)) subtasksList = t.subtasks;
      else if (typeof t.subtasks === 'string') {
        try { subtasksList = JSON.parse(t.subtasks); } catch(e) { subtasksList = []; }
      }
      if (extCount > 0) {
        taskExtensions.push({ name: t.name, count: extCount, type: 'Task' });
      }
      subtasksList.forEach(st => {
        if (st && Array.isArray(st.deadlineExtensions) && st.deadlineExtensions.length > 0) {
          taskExtensions.push({ name: `"${st.name}" in "${t.name}"`, count: st.deadlineExtensions.length, type: 'Subtask' });
        }
      });
    });
  }

  const extendedLogs = logs.filter(l => l.deadlineExtended || l.status === 'Extended');
  if (taskExtensions.length > 0) {
    taskExtensions.sort((a, b) => b.count - a.count).slice(0, 3).forEach(a => {
      observations.push({
        text: `${a.type} ${a.name} has required repeated deadline extensions.`,
        evidence: `Extended ${a.count} time${a.count > 1 ? 's' : ''}`,
        tone: 'warning'
      });
    });
  } else if (extendedLogs.length >= MIN_PATTERN) {
    const extCounts = {};
    extendedLogs.forEach(l => {
      const name = l.subtaskName ? `${l.parentTaskName} > ${l.subtaskName}` : l.name;
      extCounts[name] = (extCounts[name] || 0) + 1;
    });
    const extArr = Object.entries(extCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    extArr.slice(0, 3).forEach(a => {
      observations.push({
        text: `${a.name} has required repeated deadline extensions.`,
        evidence: `Extended ${a.count} time${a.count > 1 ? 's' : ''}`,
        tone: 'warning'
      });
    });
  }

  // Repeatedly partial tasks
  if (taskLogs.length >= MIN_SAMPLE) {
    const partialTask = topByStatus(taskLogs, 'Partially Done');
    if (partialTask && partialTask.pct > 30) {
      observations.push({
        text: `${partialTask.name} is partially done more often than other tasks.`,
        evidence: `Partially done ${partialTask.pct}% of the time (${partialTask.count} times)`,
        tone: 'warning',
        itemName: partialTask.name
      });
    }
  }

  return observations;
}

function analyzeItemWhereBreaksDown(itemLogs, partialLogs, skippedLogs, itemName, tasks) {
  const observations = [];

  // Subtask & Next Action analysis for tasks
  const taskItem = (tasks || []).find(t => t.name === itemName);
  if (taskItem) {
    let subtasks = taskItem.subtasks;
    if (typeof subtasks === 'string') {
      try { subtasks = JSON.parse(subtasks); } catch(e) { subtasks = []; }
    }
    const directActions = Array.isArray(taskItem.nextActions) ? taskItem.nextActions : [];
    const hasChildren = (Array.isArray(subtasks) && subtasks.length > 0) || directActions.length > 0;

    if (hasChildren) {
      const childLogs = itemLogs.filter(l => l.type === 'Subtask' || l.type === 'NextAction' || l.subtaskName || l.action);
      const childGroups = {};
      childLogs.forEach(l => {
        const isAction = l.type === 'NextAction' || !!l.action;
        const sName = l.action || l.subtaskName || l.name;
        if (!childGroups[sName]) {
          childGroups[sName] = { done: 0, stuck: 0, partial: 0, skipped: 0, total: 0, isAction, name: sName };
        }
        childGroups[sName].total++;
        if (l.status === 'Done') {
          childGroups[sName].done++;
        } else {
          childGroups[sName].stuck++;
          if (l.status === 'Partially Done') childGroups[sName].partial++;
          else if (l.status === 'Skipped') childGroups[sName].skipped++;
        }
      });

      Object.entries(childGroups)
        .filter(([_, s]) => s.total >= MIN_PATTERN)
        .sort(([_, a], [__, b]) => (b.stuck / b.total) - (a.stuck / a.total))
        .slice(0, 3)
        .forEach(([name, s]) => {
          const rate = pct(s.stuck, s.total);
          if (rate >= 40) {
            const kind = s.isAction ? 'Next Action' : 'Subtask';
            const detail = s.partial > 0 && s.skipped > 0
              ? `${s.stuck} of ${s.total} sessions: ${s.partial} partial, ${s.skipped} skipped`
              : `${s.stuck} of ${s.total} sessions were ${s.skipped > 0 ? 'skipped' : 'partially done'}`;
            observations.push({
              text: `${kind} "${name}" is where ${itemName} commonly stops.`,
              evidence: `Incomplete ${rate}% of the time (${detail})`,
              tone: 'warning',
              itemName
            });
          }
        });

      // Factual breakdown of child next actions / subtasks if active
      if (Array.isArray(subtasks) && subtasks.length > 0 && taskItem.status !== 'Done') {
        let totalSubs = subtasks.length;
        let incompleteSubs = subtasks.filter(st => st.status !== 'Done').length;
        let totalChildActions = 0;
        let incompleteChildActions = 0;
        subtasks.forEach(st => {
          const actions = Array.isArray(st.nextActions) ? st.nextActions : [];
          totalChildActions += actions.length;
          incompleteChildActions += actions.filter(a => a.status !== 'Done').length;
        });

        if (totalChildActions > 0 && incompleteChildActions > 0) {
          observations.push({
            text: `${incompleteChildActions} of ${totalChildActions} Next Actions across subtasks remain incomplete.`,
            evidence: `${incompleteSubs} of ${totalSubs} subtasks are currently in progress`,
            tone: 'neutral',
            itemName
          });
        }
      }
    }
  }

  // Extension history
  let extCount = 0;
  let mostRecentExt = null;
  if (taskItem && Array.isArray(taskItem.deadlineExtensions) && taskItem.deadlineExtensions.length > 0) {
    extCount = taskItem.deadlineExtensions.length;
    const sorted = [...taskItem.deadlineExtensions].sort((a, b) => new Date(b.date || b.timestamp || 0) - new Date(a.date || a.timestamp || 0));
    mostRecentExt = sorted[0].date || sorted[0].newDeadline;
  } else {
    const extensions = itemLogs.filter(l => l.deadlineExtended || l.status === 'Extended');
    if (extensions.length >= MIN_PATTERN) {
      extCount = extensions.length;
      mostRecentExt = extensions.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date;
    }
  }

  if (extCount >= (MIN_PATTERN > 2 ? 2 : MIN_PATTERN)) {
    observations.push({
      text: `${itemName} has required ${extCount} deadline extension${extCount > 1 ? 's' : ''}.`,
      evidence: mostRecentExt ? `Most recent: ${mostRecentExt}` : `Recorded ${extCount} extensions`,
      tone: 'warning',
      itemName
    });
  }

  // Remaining work patterns
  const remainingWorkLogs = itemLogs.filter(l => l.remainingWork && l.remainingWork.trim());
  if (remainingWorkLogs.length >= MIN_PATTERN) {
    const remaining = topActivities(remainingWorkLogs, 'remainingWork');
    remaining.slice(0, 2).forEach(a => {
      observations.push({
        text: `"${a.activity}" repeatedly appears as remaining work for ${itemName}.`,
        evidence: `Logged ${a.count} time${a.count > 1 ? 's' : ''}`,
        tone: 'warning',
        itemName
      });
    });
  }

  if (observations.length === 0) {
    return [];
  }

  return observations;
}

// ============================================================
// Question 5: What Is Changing?
// ============================================================

function analyzeWhatIsChanging(logs, habits, tasks) {
  const observations = [];
  const trends = getTrends(logs);

  if (trends.length === 0 && logs.length < MIN_SAMPLE) {
    return [];
  }

  trends.forEach(t => {
    if (t.direction === 'improving') {
      observations.push({
        text: `${t.name} is improving — completion went up recently.`,
        evidence: `From ${t.before}% to ${t.after}% over the last 2 weeks`,
        tone: 'positive',
        itemName: t.name
      });
    } else {
      observations.push({
        text: `${t.name} is declining — completion dropped recently.`,
        evidence: `From ${t.before}% to ${t.after}% over the last 2 weeks`,
        tone: 'negative',
        itemName: t.name
      });
    }
  });

  // Weekly comparison
  const thisWeek = logsInLastDays(logs, 7);
  const lastWeek = logsInDayRange(logs, 7, 14);
  if (thisWeek.length >= MIN_TREND && lastWeek.length >= MIN_TREND) {
    const thisWeekDone = thisWeek.filter(l => l.status === 'Done').length;
    const lastWeekDone = lastWeek.filter(l => l.status === 'Done').length;
    const thisRate = pct(thisWeekDone, thisWeek.length);
    const lastRate = pct(lastWeekDone, lastWeek.length);
    const diff = thisRate - lastRate;

    if (Math.abs(diff) >= 10) {
      observations.push({
        text: diff > 0
          ? `This week's completion rate is higher than last week.`
          : `This week's completion rate is lower than last week.`,
        evidence: `${thisRate}% this week vs ${lastRate}% last week`,
        tone: diff > 0 ? 'positive' : 'warning'
      });
    }
  }

  if (observations.length === 0) {
    return [];
  }

  return observations;
}

function analyzeItemWhatIsChanging(itemLogs, doneLabel, itemName) {
  const observations = [];

  const trend = getHabitTrend(itemLogs);
  if (trend) {
    if (trend.direction === 'improving') {
      observations.push({
        text: `${itemName} is improving — ${doneLabel} rate went up.`,
        evidence: `From ${trend.before}% to ${trend.after}% over the last 2 weeks`,
        tone: 'positive',
        itemName
      });
    } else {
      observations.push({
        text: `${itemName} is declining — ${doneLabel} rate dropped.`,
        evidence: `From ${trend.before}% to ${trend.after}% recently`,
        tone: 'negative',
        itemName
      });
    }
  }

  // Streak info
  const streak = calculateStreak(itemLogs);
  if (streak.current > 0) {
    observations.push({
      text: `${itemName} is on a ${streak.current}-day streak.`,
      evidence: `Current streak: ${streak.current} day${streak.current > 1 ? 's' : ''}${streak.best > streak.current ? ` (best: ${streak.best} days)` : ' — personal best!'}`,
      tone: 'positive',
      itemName
    });
  } else {
    const doneLogs = itemLogs.filter(l => l.status === 'Done');
    if (doneLogs.length > 0) {
      const lastDone = doneLogs.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      observations.push({
        text: `${itemName} was last ${doneLabel} on ${lastDone.date}.`,
        evidence: streak.best > 1 ? `Best streak was ${streak.best} days` : '',
        tone: 'neutral',
        itemName
      });
    }
  }

  // Recent activity summary
  const recentLogs = itemLogs
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  if (recentLogs.length > 0) {
    const recentText = recentLogs.map(l => `[${l.status}] ${l.date}`).join('\n');
    observations.push({
      text: 'Recent activity:',
      evidence: recentText,
      tone: 'neutral',
      itemName
    });
  }

  if (observations.length === 0) {
    return [];
  }

  return observations;
}

// ============================================================
// Quit Habit Analysis — Dedicated Functions
// ============================================================

/**
 * What helps resist a quit habit.
 * Analyzes: resist activities, before-activity on resist days, urge counts.
 */
function analyzeQuitWhatHelps(itemLogs, doneLogs, partialLogs, itemName) {
  const observations = [];

  if (doneLogs.length < MIN_PATTERN) {
    return [];
  }

  // Resistance rate
  const resistRate = pct(doneLogs.length, itemLogs.length);
  observations.push({
    text: `Resistance was recorded in ${resistRate}% of logged sessions for ${itemName}.`,
    evidence: `${doneLogs.length} resisted out of ${itemLogs.length} total sessions`,
    tone: resistRate >= 60 ? 'positive' : resistRate >= 30 ? 'neutral' : 'negative',
    itemName
  });

  // Replacement activity usage
  const replLogs = doneLogs.filter(l => l.usedReplacementAction === 'Yes' || (l.replacementAction && l.action && l.action.toLowerCase() === l.replacementAction.toLowerCase()));
  if (replLogs.length >= MIN_PATTERN) {
    observations.push({
      text: `Resistance was recorded more often when replacement activities were used.`,
      evidence: `Recorded in ${replLogs.length} of ${doneLogs.length} resisted sessions`,
      tone: 'positive',
      itemName
    });
  }

  // Activities before resistance
  const beforeResist = topActivities(doneLogs, 'beforeActivity');
  beforeResist.slice(0, 3).forEach(a => {
    observations.push({
      text: `"${a.activity}" was recorded before urge resistance.`,
      evidence: `Preceded ${a.count} of ${doneLogs.length} resisted sessions`,
      tone: 'positive',
      itemName
    });
  });

  // Physical state during resistance
  const physResist = topActivities(doneLogs, 'physicalState');
  physResist.slice(0, 2).forEach(p => {
    observations.push({
      text: `Physical state "${p.activity}" was recorded during urge resistance.`,
      evidence: `Recorded in ${p.count} of ${doneLogs.length} resisted sessions`,
      tone: 'positive',
      itemName
    });
  });

  // Mental state during resistance
  const mentResist = topActivities(doneLogs, 'mentalState');
  mentResist.slice(0, 2).forEach(m => {
    observations.push({
      text: `Mental state "${m.activity}" was recorded during urge resistance.`,
      evidence: `Recorded in ${m.count} of ${doneLogs.length} resisted sessions`,
      tone: 'positive',
      itemName
    });
  });

  // What activities helped resist
  const resistActs = topActivities(doneLogs, 'resistActivity');
  resistActs.slice(0, 2).forEach(a => {
    observations.push({
      text: `"${a.activity}" was recorded during successful urge resistance.`,
      evidence: `Used in ${a.count} of ${doneLogs.length} resisted sessions`,
      tone: 'positive',
      itemName
    });
  });

  // Urge count analysis
  const urgeLogs = doneLogs.filter(l => l.urgeCount && parseInt(l.urgeCount) > 0);
  if (urgeLogs.length >= MIN_PATTERN) {
    const avgUrge = Math.round(urgeLogs.reduce((s, l) => s + parseInt(l.urgeCount), 0) / urgeLogs.length);
    observations.push({
      text: `Average urge count recorded during resisted sessions was ${avgUrge}.`,
      evidence: `Based on ${urgeLogs.length} sessions with urge count data`,
      tone: 'neutral',
      itemName
    });
  }

  return observations;
}

/**
 * What gets in the way of resistance for Quit habits.
 */
function analyzeQuitWhatBlocks(itemLogs, partialLogs, skippedLogs, itemName) {
  const observations = [];
  const failLogs = partialLogs.concat(skippedLogs);

  if (failLogs.length < MIN_PATTERN) {
    return [];
  }

  // Partial resistance analysis
  if (partialLogs.length >= MIN_PATTERN) {
    const beforePartial = topActivities(partialLogs, 'beforeActivity');
    beforePartial.slice(0, 2).forEach(a => {
      observations.push({
        text: `"${a.activity}" was recorded before partial resistance of ${itemName}.`,
        evidence: `Preceded ${a.count} of ${partialLogs.length} partial sessions`,
        tone: 'warning',
        itemName
      });
    });

    const partialRepl = partialLogs.filter(l => l.usedReplacementAction === 'Yes' || (l.replacementAction && l.action && l.action.toLowerCase() === l.replacementAction.toLowerCase()));
    if (partialRepl.length >= MIN_PATTERN) {
      observations.push({
        text: `Replacement activity was used in ${partialRepl.length} of ${partialLogs.length} partially resisted sessions.`,
        evidence: `Recorded in ${partialRepl.length} partial sessions`,
        tone: 'positive',
        itemName
      });
    }

    const physPartial = topActivities(partialLogs, 'physicalState');
    physPartial.slice(0, 2).forEach(p => {
      observations.push({
        text: `Physical state "${p.activity}" was recorded during partial resistance.`,
        evidence: `Recorded in ${p.count} of ${partialLogs.length} partial sessions`,
        tone: 'warning',
        itemName
      });
    });

    const mentPartial = topActivities(partialLogs, 'mentalState');
    mentPartial.slice(0, 2).forEach(m => {
      observations.push({
        text: `Mental state "${m.activity}" was recorded during partial resistance.`,
        evidence: `Recorded in ${m.count} of ${partialLogs.length} partial sessions`,
        tone: 'warning',
        itemName
      });
    });
  }

  // Quit behavior occurred (Skipped)
  if (skippedLogs.length >= MIN_PATTERN) {
    const beforeOccurred = topActivities(skippedLogs, 'beforeActivity');
    beforeOccurred.slice(0, 3).forEach(a => {
      observations.push({
        text: `Quit behavior occurred more often after "${a.activity}".`,
        evidence: `Among ${skippedLogs.length} logged occurrences, ${a.count} occurred after this activity`,
        tone: 'negative',
        itemName
      });
    });

    const physOccurred = topActivities(skippedLogs, 'physicalState');
    physOccurred.slice(0, 2).forEach(p => {
      observations.push({
        text: `Physical state "${p.activity}" was recorded when quit behavior occurred.`,
        evidence: `Recorded in ${p.count} of ${skippedLogs.length} occurrences`,
        tone: 'negative',
        itemName
      });
    });

    const mentOccurred = topActivities(skippedLogs, 'mentalState');
    mentOccurred.slice(0, 2).forEach(m => {
      observations.push({
        text: `Mental state "${m.activity}" was recorded when quit behavior occurred.`,
        evidence: `Recorded in ${m.count} of ${skippedLogs.length} occurrences`,
        tone: 'negative',
        itemName
      });
    });
  }

  return observations;
}

/**
 * Where quit habit resistance is strongest — time/day/place patterns.
 */
function analyzeQuitWhereBest(itemLogs, doneLogs, partialLogs, skippedLogs, itemName) {
  const observations = [];

  if (doneLogs.length < MIN_PATTERN) {
    return [];
  }

  // Best day for resistance
  if (doneLogs.length >= MIN_SAMPLE) {
    const bestDayResult = habitBestDay(doneLogs);
    if (bestDayResult) {
      observations.push({
        text: `Urge resistance for ${itemName} was recorded most frequently on ${bestDayResult.day}.`,
        evidence: `${bestDayResult.count} of ${doneLogs.length} resistances recorded on ${bestDayResult.day}`,
        tone: 'positive',
        itemName
      });
    }
  }

  // Time-of-day analysis for resistance
  const timeSlots = analyzeTimeSlots(doneLogs);
  if (timeSlots.best) {
    observations.push({
      text: `Resistance to ${itemName} was recorded most frequently in the ${timeSlots.best.slot.toLowerCase()}.`,
      evidence: `${timeSlots.best.count} of ${doneLogs.length} successful resistances during this period`,
      tone: 'positive',
      itemName
    });
  }

  // Place patterns for resistance
  const placeLogs = doneLogs.filter(l => l.place && l.place.trim());
  if (placeLogs.length >= MIN_PATTERN) {
    const placeStats = {};
    placeLogs.forEach(l => {
      const p = l.place.trim().toLowerCase();
      placeStats[p] = (placeStats[p] || 0) + 1;
    });
    const topPlace = Object.entries(placeStats).sort((a, b) => b[1] - a[1])[0];
    if (topPlace && topPlace[1] >= MIN_PATTERN) {
      observations.push({
        text: `Urge resistance was recorded more often at "${topPlace[0]}".`,
        evidence: `${topPlace[1]} of ${placeLogs.length} sessions at this location`,
        tone: 'positive',
        itemName
      });
    }
  }

  // Overall resistance rate
  const resistRate = pct(doneLogs.length, itemLogs.length);
  const partialRate = pct(doneLogs.length + partialLogs.length, itemLogs.length);
  observations.push({
    text: `${itemName} overall: ${resistRate}% fully resisted, ${partialRate}% partially or fully resisted.`,
    evidence: `${doneLogs.length} resisted, ${partialLogs.length} partial, ${skippedLogs.length} occurred out of ${itemLogs.length}`,
    tone: resistRate >= 60 ? 'positive' : resistRate >= 30 ? 'neutral' : 'negative',
    itemName
  });

  return observations;
}

/**
 * Where resistance breaks down — recurring before-activity, day, time, place patterns.
 */
function analyzeQuitWhereBreaksDown(itemLogs, partialLogs, skippedLogs, itemName) {
  const observations = [];
  const failLogs = skippedLogs.concat(partialLogs);

  if (failLogs.length < MIN_PATTERN) {
    return [];
  }

  // Worst day (most occurrences / partial)
  if (failLogs.length >= MIN_SAMPLE) {
    const worstDayResult = habitBestDay(failLogs);
    if (worstDayResult) {
      observations.push({
        text: `Quit behavior for ${itemName} occurred most often on ${worstDayResult.day}.`,
        evidence: `${worstDayResult.count} non-resisted sessions on ${worstDayResult.day}`,
        tone: 'warning',
        itemName
      });
    }
  }

  // Time-of-day when quit behavior occurred
  const failTimeSlots = analyzeTimeSlots(failLogs);
  if (failTimeSlots.best) {
    observations.push({
      text: `Quit behavior occurred more frequently in the ${failTimeSlots.best.slot.toLowerCase()}.`,
      evidence: `${failTimeSlots.best.count} of ${failLogs.length} non-resisted sessions during this period`,
      tone: 'warning',
      itemName
    });
  }

  // Before-activity patterns
  const beforeActs = topActivities(failLogs, 'beforeActivity');
  const repeatedBefore = beforeActs.filter(a => a.count >= 2);
  repeatedBefore.slice(0, 2).forEach(a => {
    observations.push({
      text: `Quit behavior occurred after "${a.activity}" in ${a.count} sessions.`,
      evidence: `Preceded ${a.count} of ${failLogs.length} non-resisted sessions`,
      tone: 'warning',
      itemName
    });
  });

  // Place breakdown
  const placeLogs = failLogs.filter(l => l.place && l.place.trim());
  if (placeLogs.length >= MIN_PATTERN) {
    const placeStats = {};
    placeLogs.forEach(l => {
      const p = l.place.trim().toLowerCase();
      placeStats[p] = (placeStats[p] || 0) + 1;
    });
    const topPlace = Object.entries(placeStats).sort((a, b) => b[1] - a[1])[0];
    if (topPlace && topPlace[1] >= MIN_PATTERN) {
      observations.push({
        text: `Quit behavior was recorded more often at "${topPlace[0]}".`,
        evidence: `${topPlace[1]} of ${placeLogs.length} sessions at this location`,
        tone: 'warning',
        itemName
      });
    }
  }

  // Skipped (did the bad habit) vs partially resisted comparison
  if (skippedLogs.length >= MIN_PATTERN && partialLogs.length >= MIN_PATTERN) {
    const skipRate = pct(skippedLogs.length, itemLogs.length);
    const partialRate = pct(partialLogs.length, itemLogs.length);
    observations.push({
      text: `${itemName}: fully occurred ${skipRate}% of the time, partially resisted ${partialRate}%.`,
      evidence: `${skippedLogs.length} full occurrences, ${partialLogs.length} partial resistances`,
      tone: 'neutral',
      itemName
    });
  }

  return observations;
}

// ============================================================
// Helper: Time Slot Analysis
// ============================================================

function analyzeTimeSlots(logs) {
  const timeSlot = (time) => {
    if (!time) return null;
    const match = time.match(/(\d+):(\d+)/);
    if (!match) return null;
    const h = parseInt(match[1]);
    if (h < 6) return 'Late Night (12–6 AM)';
    if (h < 12) return 'Morning (6 AM–12 PM)';
    if (h < 17) return 'Afternoon (12–5 PM)';
    if (h < 21) return 'Evening (5–9 PM)';
    return 'Night (9 PM–12 AM)';
  };

  const slotCounts = {};
  logs.forEach(l => {
    const slot = timeSlot(l.time || l.activityStartTime);
    if (slot) slotCounts[slot] = (slotCounts[slot] || 0) + 1;
  });

  const sorted = Object.entries(slotCounts)
    .map(([slot, count]) => ({ slot, count }))
    .sort((a, b) => b.count - a.count);

  return {
    best: sorted[0] || null,
    worst: sorted[sorted.length - 1] || null,
    all: sorted
  };
}

// ============================================================
// Preserved Helper Functions
// ============================================================

/** Find the item with the highest percentage for a given status. */
function topByStatus(logs, status) {
  const groups = groupByName(logs);
  let best = null;

  for (const [name, entries] of Object.entries(groups)) {
    const total = entries.length;
    const count = entries.filter(e => e.status === status).length;
    const p = pct(count, total);

    if (!best || p > best.pct || (p === best.pct && count > best.count)) {
      best = { name, pct: p, count };
    }
  }

  return best;
}

/**
 * Aggregate a free-text behavioral field into top activities.
 * @param {Array} logs — filtered log entries
 * @param {string} field — field name to analyze
 * @returns {Array} [{ activity, count }, ...] sorted desc
 */
function topActivities(logs, field) {
  const counts = {};
  logs.forEach(l => {
    let val = '';
    if (field === 'beforeActivity' || field === 'previousActivity') {
      val = (l.beforeActivity || l.previousActivity || '').toString().trim();
    } else if (field === 'action') {
      val = (l.action || l.completedWork || l.actualAction || l.resistActivity || l.alternativeActivity || '').toString().trim();
    } else {
      val = (l[field] || '').toString().trim();
    }
    if (val) {
      const key = val.toLowerCase();
      if (!counts[key]) {
        counts[key] = { activity: val, count: 0 };
      }
      counts[key].count++;
    }
  });

  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .filter(a => a.count >= MIN_PATTERN);
}

/**
 * Analyze place correlation with success/failure.
 * @param {Array} logs — log entries
 * @returns {Object|null} insight object or null
 */
function placeCorrelation(logs) {
  const placeLogs = logs.filter(l => l.place && l.place.trim());
  if (placeLogs.length < MIN_SAMPLE) return null;

  const placeStats = {};
  placeLogs.forEach(l => {
    const place = l.place.trim().toLowerCase();
    if (!placeStats[place]) placeStats[place] = { done: 0, total: 0 };
    placeStats[place].total++;
    if (l.status === 'Done' || l.status === 'Partially Done') placeStats[place].done++;
  });

  let bestPlace = null;
  let bestRate = 0;
  for (const [place, stats] of Object.entries(placeStats)) {
    if (stats.total >= 3) {
      const rate = pct(stats.done, stats.total);
      if (rate > bestRate) {
        bestRate = rate;
        bestPlace = place;
      }
    }
  }

  if (bestPlace && bestRate >= 60) {
    return {
      text: `"${bestPlace}" appears associated with higher completion.`,
      evidence: `${bestRate}% success rate at this place`,
      tone: 'positive'
    };
  }

  return null;
}

/** Find the day of week with the most completions. */
function bestDay(logs) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayCounts = new Array(7).fill(0);

  logs.filter(l => l.status === 'Done').forEach(l => {
    const d = new Date(l.date);
    if (!isNaN(d)) dayCounts[d.getDay()]++;
  });

  let bestIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (dayCounts[i] > dayCounts[bestIdx]) bestIdx = i;
  }

  return dayCounts[bestIdx] > 0 ? { day: dayNames[bestIdx], count: dayCounts[bestIdx] } : null;
}

/** Compare the last 2 weeks vs the prior 2 weeks. */
function getTrends(logs) {
  const recent = logsInDayRange(logs, 0, 14);
  const prior  = logsInDayRange(logs, 14, 28);
  const results = [];
  const names = [...new Set(logs.map(l => l.name))];

  names.forEach(name => {
    const r = recent.filter(l => l.name === name);
    const p = prior.filter(l => l.name === name);

    if (r.length < MIN_TREND || p.length < MIN_TREND) return;

    const recentPct = pct(r.filter(l => l.status === 'Done').length, r.length);
    const priorPct  = pct(p.filter(l => l.status === 'Done').length, p.length);
    const diff = recentPct - priorPct;

    if (diff >= 15) {
      results.push({ name, before: priorPct, after: recentPct, direction: 'improving' });
    } else if (diff <= -15) {
      results.push({ name, before: priorPct, after: recentPct, direction: 'declining' });
    }
  });

  return results;
}

/** Return logs from the last N days. */
function logsInLastDays(logs, days) {
  return logsInDayRange(logs, 0, days);
}

/** Return logs between startDaysAgo and endDaysAgo. */
function logsInDayRange(logs, startDaysAgo, endDaysAgo) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setDate(start.getDate() - endDaysAgo);
  const end = new Date(now);
  end.setDate(end.getDate() - startDaysAgo);

  return logs.filter(l => {
    const d = new Date(l.date);
    return d >= start && d <= end;
  });
}

/** Group logs by name into an object. */
function groupByName(logs) {
  const groups = {};
  logs.forEach(l => {
    if (!groups[l.name]) groups[l.name] = [];
    groups[l.name].push(l);
  });
  return groups;
}

/** Calculate percentage, rounded to integer. */
function pct(part, total) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/** Calculate current and best streaks. */
function calculateStreak(habitLogs) {
  const logsByDate = {};
  habitLogs.forEach(l => {
    if (!logsByDate[l.date]) logsByDate[l.date] = [];
    logsByDate[l.date].push(l);
  });

  const dates = Object.keys(logsByDate).sort().reverse();
  if (dates.length === 0) return { current: 0, best: 0 };

  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;
  let foundFirstBreak = false;

  for (let i = 0; i < dates.length; i++) {
    const dayLogs = logsByDate[dates[i]];
    const hasDone = dayLogs.some(l => l.status === 'Done');

    if (hasDone) {
      tempStreak++;
      if (!foundFirstBreak) currentStreak = tempStreak;
    } else {
      if (!foundFirstBreak) foundFirstBreak = true;
      bestStreak = Math.max(bestStreak, tempStreak);
      tempStreak = 0;
    }
  }
  bestStreak = Math.max(bestStreak, tempStreak);
  if (!foundFirstBreak) currentStreak = tempStreak;

  return { current: currentStreak, best: bestStreak };
}

/** Find the best day-of-week for done logs. */
function habitBestDay(doneLogs) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const counts = new Array(7).fill(0);

  doneLogs.forEach(l => {
    const d = new Date(l.date);
    if (!isNaN(d)) counts[d.getDay()]++;
  });

  let bestIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (counts[i] > counts[bestIdx]) bestIdx = i;
  }

  return counts[bestIdx] > 0 ? { day: dayNames[bestIdx], count: counts[bestIdx] } : null;
}

/** Get trend for a single habit. */
function getHabitTrend(habitLogs) {
  const recent = logsInDayRange(habitLogs, 0, 14);
  const prior = logsInDayRange(habitLogs, 14, 28);

  if (recent.length < MIN_TREND || prior.length < MIN_TREND) return null;

  const recentPct = pct(recent.filter(l => l.status === 'Done').length, recent.length);
  const priorPct = pct(prior.filter(l => l.status === 'Done').length, prior.length);
  const diff = recentPct - priorPct;

  if (diff >= 15) return { before: priorPct, after: recentPct, direction: 'improving' };
  if (diff <= -15) return { before: priorPct, after: recentPct, direction: 'declining' };
  return null;
}

/** Truncate a string to a maximum length. */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '\u2026' : str;
}

// ============================================================
// Plan Adherence Analysis
// ============================================================

/**
 * Analyze plan adherence patterns based on today's plan items and logs
 * @param {Array} logs
 * @param {Array} planItems 
 * @returns {Object} plan adherence insights
 */
function analyzePlanAdherence(logs, planItems) {
  if (!planItems || planItems.length === 0) {
    return { summary: null, patterns: [] };
  }

  const completedPlans = planItems.filter(p => p.status !== 'Pending' && p.status !== 'Not Logged');
  if (completedPlans.length < MIN_SAMPLE) {
    return {
      summary: { total: planItems.length, completed: completedPlans.length, asPlanned: 0, rescheduled: 0, partial: 0, skipped: 0 },
      patterns: []
    };
  }

  const asPlanned = completedPlans.filter(p => p.completionType === 'as-planned');
  const rescheduled = completedPlans.filter(p => p.completionType === 'after-reschedule');
  const partial = completedPlans.filter(p => p.completionType === 'partial');
  const skipped = completedPlans.filter(p => p.completionType === 'skipped');

  const summary = {
    total: completedPlans.length,
    asPlanned: asPlanned.length,
    rescheduled: rescheduled.length,
    partial: partial.length,
    skipped: skipped.length,
    adherenceRate: pct(asPlanned.length, completedPlans.length),
    rescheduleRate: pct(rescheduled.length, completedPlans.length)
  };

  const patterns = [];

  // Observation 1: Reschedule Frequency
  if (rescheduled.length >= MIN_PATTERN) {
    const multiReschedule = rescheduled.filter(p => p.rescheduleCount > 1);
    if (multiReschedule.length >= Math.max(MIN_PATTERN, rescheduled.length * 0.4)) {
      patterns.push({
        type: 'warning',
        text: `You frequently alter your plans multiple times before completion (${multiReschedule.length} items). Consider if initial times are realistic.`
      });
    } else {
      patterns.push({
        type: 'neutral',
        text: `You often reschedule items but still complete them (${rescheduled.length} items). Flexibility seems to help you succeed.`
      });
    }
  }

  // Observation 2: Time of Day Success
  const timeScores = { morning: { success: 0, total: 0 }, afternoon: { success: 0, total: 0 }, evening: { success: 0, total: 0 } };
  completedPlans.forEach(p => {
    if (!p.originalStartTime) return;
    const hour = parseInt(p.originalStartTime.split(':')[0]);
    let period = 'evening';
    if (hour >= 5 && hour < 12) period = 'morning';
    else if (hour >= 12 && hour < 17) period = 'afternoon';

    timeScores[period].total++;
    if (p.completionType === 'as-planned') timeScores[period].success++;
  });

  const bestPeriod = Object.entries(timeScores)
    .filter(([_, stats]) => stats.total >= MIN_PATTERN)
    .map(([period, stats]) => ({ period, rate: stats.success / stats.total }))
    .sort((a, b) => b.rate - a.rate)[0];

  if (bestPeriod && bestPeriod.rate > 0.6) {
    patterns.push({
      type: 'success',
      text: `You are most likely to stick to your original plan for ${bestPeriod.period} activities (${Math.round(bestPeriod.rate * 100)}% adherence).`
    });
  }

  // Observation 3: High Adherence Items
  const itemScores = {};
  completedPlans.forEach(p => {
    if (!itemScores[p.targetName]) itemScores[p.targetName] = { success: 0, total: 0 };
    itemScores[p.targetName].total++;
    if (p.completionType === 'as-planned') itemScores[p.targetName].success++;
  });

  const bestItems = Object.entries(itemScores)
    .filter(([_, stats]) => stats.total >= MIN_PATTERN && (stats.success / stats.total) > 0.8)
    .sort((a, b) => b[1].success - a[1].success);

  if (bestItems.length > 0) {
    const names = bestItems.map(i => i[0]).slice(0, 2).join(' and ');
    patterns.push({
      type: 'success',
      text: `You consistently complete ${names} exactly as planned.`
    });
  }

  return { summary, patterns };
}
