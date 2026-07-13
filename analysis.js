/* ============================================================
   Behavior Log — Analysis Module
   Pure functions that take raw log arrays and return insights.
   No DOM access, no fetch calls.
   ============================================================ */

'use strict';

/**
 * Main entry point. Generates an array of insight objects.
 * Each object: { title, text, tone }
 *   tone: "positive" | "negative" | "neutral" | "warning"
 *
 * @param {Array} logs — [{date, time, type, name, status, reason, notes}, ...]
 * @returns {Array} insight objects
 */
function generateInsights(logs) {
  if (!logs || logs.length === 0) {
    return [{
      title: 'No Data Yet',
      text: 'Start logging your habits and tasks to see insights here.',
      tone: 'neutral'
    }];
  }

  const insights = [];
  const habitLogs = logs.filter((l) => l.type === 'Habit');
  const taskLogs  = logs.filter((l) => l.type === 'Task');

  // --- Weekly Summary ---
  const thisWeek = logsInLastDays(logs, 7);
  const habitsThisWeek = thisWeek.filter((l) => l.type === 'Habit' && l.status === 'Done').length;
  const tasksThisWeek  = thisWeek.filter((l) => l.type === 'Task'  && l.status === 'Done').length;

  insights.push({
    title: 'This Week',
    text: `Habits completed: ${habitsThisWeek}\nTasks completed: ${tasksThisWeek}`,
    tone: 'neutral'
  });

  // --- Overall Completion Rate ---
  const overallPct = pct(
    logs.filter((l) => l.status === 'Done').length,
    logs.length
  );
  insights.push({
    title: 'Overall Completion Rate',
    text: `${overallPct}% of all logged items were completed`,
    tone: overallPct >= 70 ? 'positive' : overallPct >= 40 ? 'neutral' : 'negative'
  });

  // --- Most Consistent Habit ---
  const bestHabit = topByStatus(habitLogs, 'Done');
  if (bestHabit) {
    insights.push({
      title: 'Most Consistent Habit',
      text: `${bestHabit.name} — completed ${bestHabit.pct}% of the time`,
      tone: 'positive'
    });
  }

  // --- Most Consistent Task ---
  const bestTask = topByStatus(taskLogs, 'Done');
  if (bestTask) {
    insights.push({
      title: 'Most Consistent Task',
      text: `${bestTask.name} — completed ${bestTask.pct}% of the time`,
      tone: 'positive'
    });
  }

  // --- Most Skipped Habit ---
  const skippedHabit = topByStatus(habitLogs, 'Skipped');
  if (skippedHabit && skippedHabit.pct > 0) {
    insights.push({
      title: 'Most Skipped Habit',
      text: `${skippedHabit.name} — skipped ${skippedHabit.pct}% of the time`,
      tone: 'warning'
    });
  }

  // --- Most Failed Habit ---
  const failedHabit = topByStatus(habitLogs, 'Failed');
  if (failedHabit && failedHabit.pct > 0) {
    insights.push({
      title: 'Usually Fails',
      text: `${failedHabit.name} — failed ${failedHabit.pct}% of the time`,
      tone: 'negative'
    });
  }

  // --- Biggest Obstacle ---
  const obstacle = biggestObstacle(logs);
  if (obstacle) {
    insights.push({
      title: 'Biggest Obstacle',
      text: `"${obstacle.reason}" caused ${obstacle.count} failure${obstacle.count > 1 ? 's' : ''}`,
      tone: 'negative'
    });
  }

  // --- Most Productive Day ---
  const best = bestDay(logs);
  if (best) {
    insights.push({
      title: 'Most Productive Day',
      text: `${best.day} — ${best.count} total completions`,
      tone: 'positive'
    });
  }

  // --- Trends (improving / declining) ---
  const trends = getTrends(logs);
  trends.forEach((t) => {
    if (t.direction === 'improving') {
      insights.push({
        title: `${t.name} is Improving ↑`,
        text: `Completion went from ${t.before}% to ${t.after}% over the last 2 weeks`,
        tone: 'positive'
      });
    } else {
      insights.push({
        title: `${t.name} is Declining ↓`,
        text: `Completion dropped from ${t.before}% to ${t.after}% recently`,
        tone: 'warning'
      });
    }
  });

  // --- Failure Breakdown ---
  const reasons = allReasons(logs);
  if (reasons.length > 1) {
    const top3 = reasons.slice(0, 3);
    const text = top3.map((r) => `${r.reason}: ${r.count} times`).join('\n');
    insights.push({
      title: 'Top Failure Reasons',
      text,
      tone: 'neutral'
    });
  }

  return insights;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Find the item with the highest percentage for a given status.
 */
function topByStatus(logs, status) {
  const groups = groupByName(logs);
  let best = null;

  for (const [name, entries] of Object.entries(groups)) {
    const total = entries.length;
    const count = entries.filter((e) => e.status === status).length;
    const p = pct(count, total);

    if (!best || p > best.pct || (p === best.pct && count > best.count)) {
      best = { name, pct: p, count };
    }
  }

  return best;
}

/**
 * Find the most common failure/skip reason.
 */
function biggestObstacle(logs) {
  const failures = logs.filter((l) => l.status === 'Failed' || l.status === 'Skipped');
  const counts = {};

  failures.forEach((l) => {
    if (l.reason) counts[l.reason] = (counts[l.reason] || 0) + 1;
  });

  let maxReason = null;
  let maxCount = 0;
  for (const [reason, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxReason = reason;
      maxCount = count;
    }
  }

  return maxReason ? { reason: maxReason, count: maxCount } : null;
}

/**
 * Return all failure reasons sorted by frequency.
 */
function allReasons(logs) {
  const failures = logs.filter((l) =>
    (l.status === 'Failed' || l.status === 'Skipped') && l.reason
  );
  const counts = {};
  failures.forEach((l) => {
    counts[l.reason] = (counts[l.reason] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Find the day of week with the most completions.
 */
function bestDay(logs) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayCounts = new Array(7).fill(0);

  logs.filter((l) => l.status === 'Done').forEach((l) => {
    const d = new Date(l.date);
    if (!isNaN(d)) dayCounts[d.getDay()]++;
  });

  let bestIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (dayCounts[i] > dayCounts[bestIdx]) bestIdx = i;
  }

  return dayCounts[bestIdx] > 0
    ? { day: dayNames[bestIdx], count: dayCounts[bestIdx] }
    : null;
}

/**
 * Compare the last 2 weeks vs the prior 2 weeks.
 * Returns items with significant changes (≥ 15 pp).
 */
function getTrends(logs) {
  const recent = logsInDayRange(logs, 0, 14);
  const prior  = logsInDayRange(logs, 14, 28);
  const results = [];
  const names = [...new Set(logs.map((l) => l.name))];

  names.forEach((name) => {
    const r = recent.filter((l) => l.name === name);
    const p = prior.filter((l) => l.name === name);

    // Need enough data in both periods
    if (r.length < 2 || p.length < 2) return;

    const recentPct = pct(r.filter((l) => l.status === 'Done').length, r.length);
    const priorPct  = pct(p.filter((l) => l.status === 'Done').length, p.length);
    const diff = recentPct - priorPct;

    if (diff >= 15) {
      results.push({ name, before: priorPct, after: recentPct, direction: 'improving' });
    } else if (diff <= -15) {
      results.push({ name, before: priorPct, after: recentPct, direction: 'declining' });
    }
  });

  return results;
}

// ============================================================
// Date Utilities
// ============================================================

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

  return logs.filter((l) => {
    const d = new Date(l.date);
    return d >= start && d <= end;
  });
}

/** Group logs by name into an object. */
function groupByName(logs) {
  const groups = {};
  logs.forEach((l) => {
    if (!groups[l.name]) groups[l.name] = [];
    groups[l.name].push(l);
  });
  return groups;
}

/** Calculate percentage, rounded to integer. */
function pct(part, total) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

// ============================================================
// Per-Habit / Per-Task Deep Dive Insights
// ============================================================

/**
 * Generate detailed insights for a single habit or task.
 * Uses both reasons and notes to build success strategies and failure patterns.
 *
 * @param {Array}  logs      — all logs (will be filtered internally)
 * @param {string} itemName  — the specific habit or task to analyze
 * @param {Array}  habits    — habit items from IndexedDB (to get behaviorType)
 * @returns {Array} insight objects [{title, text, tone}, ...]
 */
function generateHabitInsights(logs, itemName, habits) {
  const isTask = logs.some((l) => l.name === itemName && l.type === 'Task');
  const type = isTask ? 'Task' : 'Habit';
  const itemLogs = logs.filter((l) => l.name === itemName && l.type === type);

  if (itemLogs.length === 0) {
    return [{
      title: `No data for "${itemName}"`,
      text: `Start logging this ${type.toLowerCase()} to see detailed insights here.`,
      tone: 'neutral'
    }];
  }

  // Determine if quit habit
  const habitItem = (habits || []).find((h) => h.name === itemName);
  const isQuitHabit = habitItem && habitItem.behaviorType === 'Bad';

  // Done/Fail labels
  let doneLabel = 'Completed';
  let failLabel = 'Failed';
  if (type === 'Habit') {
    doneLabel = isQuitHabit ? 'Resisted' : 'Completed';
    failLabel = isQuitHabit ? 'Indulged' : 'Failed';
  }

  const insights = [];
  const doneLogs = itemLogs.filter((l) => l.status === 'Done');
  const failedLogs = itemLogs.filter((l) => l.status === 'Failed');
  const skippedLogs = itemLogs.filter((l) => l.status === 'Skipped');

  // --- 1. Completion Rate ---
  const completionPct = pct(doneLogs.length, itemLogs.length);
  const rateTitle = type === 'Task' ? 'Completion Rate' : (isQuitHabit ? 'Resistance Rate' : 'Completion Rate');
  insights.push({
    title: rateTitle,
    text: `${completionPct}% — ${doneLabel} ${doneLogs.length} out of ${itemLogs.length} logged entries`,
    tone: completionPct >= 70 ? 'positive' : completionPct >= 40 ? 'neutral' : 'negative'
  });

  // --- 2. Current Streak ---
  const streak = calculateStreak(itemLogs);
  if (streak.current > 0) {
    insights.push({
      title: `Current Streak 🔥`,
      text: `${streak.current} day${streak.current > 1 ? 's' : ''} in a row!`,
      tone: 'positive'
    });
  } else if (doneLogs.length > 0) {
    const lastDone = doneLogs.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    insights.push({
      title: 'Last Success',
      text: `Last ${doneLabel.toLowerCase()} on ${lastDone.date}`,
      tone: 'neutral'
    });
  }

  // --- 3. Best Streak ---
  if (streak.best > 1) {
    insights.push({
      title: 'Best Streak',
      text: `Your longest streak was ${streak.best} days — aim to beat it!`,
      tone: 'positive'
    });
  }

  // --- 4. Success Strategies (from notes) ---
  const successNotes = extractSuccessStrategies(itemLogs);
  if (successNotes.length > 0) {
    let label = 'What Helped You Succeed';
    if (type === 'Habit') {
      label = isQuitHabit ? 'What Helped You Resist' : 'What Helped You Succeed';
    } else {
      label = 'How You Achieved It';
    }
    const notesList = successNotes.slice(0, 5).map((n) => `• ${n}`).join('\n');
    insights.push({
      title: `💡 ${label}`,
      text: notesList,
      tone: 'positive'
    });
  }

  // --- 5. Failure Patterns (reasons + notes) ---
  const failReasons = countReasons(failedLogs.concat(skippedLogs));
  if (failReasons.length > 0) {
    const label = type === 'Task' ? 'Why You Failed/Skipped' : (isQuitHabit ? 'What Made You Give In' : 'Why You Failed');
    const reasonsList = failReasons.slice(0, 4).map((r) => `• ${r.reason}: ${r.count} time${r.count > 1 ? 's' : ''}`).join('\n');
    insights.push({
      title: `⚠️ ${label}`,
      text: reasonsList,
      tone: 'negative'
    });
  }

  // --- 5b. Failure Notes / trigger reflections ---
  const failNotes = extractFailurePatterns(itemLogs);
  if (failNotes.length > 0) {
    const label = type === 'Task' ? 'Failure Reflections' : (isQuitHabit ? 'Triggers & Reflections' : 'Failure Reflections');
    const notesList = failNotes.slice(0, 4).map((n) => `• "${n}"`).join('\n');
    insights.push({
      title: `📝 ${label}`,
      text: notesList,
      tone: 'warning'
    });
  }

  // --- 6. Best Day of Week/Task ---
  const bestDayResult = habitBestDay(doneLogs);
  if (bestDayResult) {
    insights.push({
      title: `Best Day for This ${type}`,
      text: `You ${doneLabel.toLowerCase()} most on ${bestDayResult.day} (${bestDayResult.count} times)`,
      tone: 'neutral'
    });
  }

  // --- 7. Time-of-Day Pattern ---
  const timePattern = analyzeTimeOfDay(doneLogs, failedLogs);
  if (timePattern) {
    insights.push({
      title: 'Time-of-Day Pattern',
      text: timePattern,
      tone: 'neutral'
    });
  }

  // --- 8. Trend ---
  const trend = getHabitTrend(itemLogs);
  if (trend) {
    const trendLabel = type === 'Task' ? 'Completion' : (isQuitHabit ? 'Resistance' : 'Completion');
    if (trend.direction === 'improving') {
      insights.push({
        title: `Improving ↑`,
        text: `${trendLabel} went from ${trend.before}% to ${trend.after}% over the last 2 weeks`,
        tone: 'positive'
      });
    } else {
      insights.push({
        title: `Declining ↓`,
        text: `${trendLabel} dropped from ${trend.before}% to ${trend.after}% recently`,
        tone: 'warning'
      });
    }
  }

  // --- 9. Recent Activity ---
  const recentLogs = itemLogs
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  if (recentLogs.length > 0) {
    const logLines = recentLogs.map((l) => {
      const statusIcon = l.status === 'Done' ? '✓' : l.status === 'Failed' ? '✗' : '○';
      const note = l.notes ? ` — ${truncate(l.notes, 40)}` : '';
      return `${statusIcon} ${l.date}${note}`;
    }).join('\n');
    insights.push({
      title: 'Recent Activity',
      text: logLines,
      tone: 'neutral'
    });
  }

  return insights;
}

// ============================================================
// Per-Habit Helper Functions
// ============================================================

/**
 * Calculate current and best streaks for a habit or task.
 * A streak is consecutive days with "Done" status.
 */
function calculateStreak(habitLogs) {
  // Get unique dates sorted descending
  const logsByDate = {};
  habitLogs.forEach((l) => {
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
    const hasDone = dayLogs.some((l) => l.status === 'Done');

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

/**
 * Extract success strategies/notes depending on log properties.
 */
function extractSuccessStrategies(logs) {
  const notes = [];
  const seen = new Set();

  logs.forEach((l) => {
    if (!l.notes) return;
    const rawNote = l.notes.trim();
    if (!rawNote) return;

    let strategy = '';
    if (rawNote.startsWith('[RESISTED] ')) {
      strategy = rawNote.substring(11);
    } else if (rawNote.startsWith('[DONE] How I achieved it: ')) {
      strategy = rawNote.substring(26);
    } else if (rawNote.startsWith('[DONE] How I did it: ')) {
      // New format for build habits
      strategy = rawNote.substring(21);
    } else if (rawNote.includes('How to do better: ')) {
      const parts = rawNote.split('How to do better: ');
      if (parts.length > 1) {
        strategy = parts[1].trim();
      }
    } else if (!rawNote.startsWith('[FAILED]') && !rawNote.startsWith('[DONE]') && !rawNote.startsWith('[RESISTED]')) {
      strategy = rawNote;
    }

    if (strategy) {
      const normalized = strategy.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        notes.push(strategy);
      }
    }
  });

  return notes;
}

/**
 * Extract failure/trigger reflections from logs.
 */
function extractFailurePatterns(logs) {
  const notes = [];
  const seen = new Set();

  logs.forEach((l) => {
    if (!l.notes) return;
    const rawNote = l.notes.trim();
    if (!rawNote) return;

    let pattern = '';
    if (rawNote.startsWith('[FAILED] How I failed: ')) {
      const index = rawNote.indexOf('| How to do better:');
      if (index !== -1) {
        pattern = rawNote.substring(23, index).trim();
      } else {
        pattern = rawNote.substring(23).trim();
      }
    } else if (rawNote.startsWith('[FAILED] Why I failed: ')) {
      pattern = rawNote.substring(23);
    } else if (!rawNote.startsWith('[FAILED]') && !rawNote.startsWith('[DONE]') && !rawNote.startsWith('[RESISTED]')) {
      pattern = rawNote;
    }

    if (pattern) {
      const normalized = pattern.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        notes.push(pattern);
      }
    }
  });

  return notes;
}

/**
 * Count and sort reasons from logs.
 */
function countReasons(logs) {
  const counts = {};
  logs.forEach((l) => {
    if (l.reason) counts[l.reason] = (counts[l.reason] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Find the best day-of-week for a habit's done logs.
 */
function habitBestDay(doneLogs) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const counts = new Array(7).fill(0);

  doneLogs.forEach((l) => {
    const d = new Date(l.date);
    if (!isNaN(d)) counts[d.getDay()]++;
  });

  let bestIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (counts[i] > counts[bestIdx]) bestIdx = i;
  }

  return counts[bestIdx] > 0 ? { day: dayNames[bestIdx], count: counts[bestIdx] } : null;
}

/**
 * Analyze time-of-day patterns.
 */
function analyzeTimeOfDay(doneLogs, failedLogs) {
  const timeSlot = (time) => {
    if (!time) return null;
    const match = time.match(/(\d+):(\d+)/);
    if (!match) return null;
    const h = parseInt(match[1]);
    if (h < 6) return 'Late Night';
    if (h < 12) return 'Morning';
    if (h < 17) return 'Afternoon';
    if (h < 21) return 'Evening';
    return 'Night';
  };

  const successSlots = {};
  const failSlots = {};

  doneLogs.forEach((l) => {
    const slot = timeSlot(l.time);
    if (slot) successSlots[slot] = (successSlots[slot] || 0) + 1;
  });

  failedLogs.forEach((l) => {
    const slot = timeSlot(l.time);
    if (slot) failSlots[slot] = (failSlots[slot] || 0) + 1;
  });

  const bestSlot = Object.entries(successSlots).sort((a, b) => b[1] - a[1])[0];
  const worstSlot = Object.entries(failSlots).sort((a, b) => b[1] - a[1])[0];

  if (!bestSlot && !worstSlot) return null;

  const parts = [];
  if (bestSlot) parts.push(`You succeed most in the ${bestSlot[0].toLowerCase()} (${bestSlot[1]}x)`);
  if (worstSlot) parts.push(`Most failures happen in the ${worstSlot[0].toLowerCase()} (${worstSlot[1]}x)`);
  return parts.join('\n');
}

/**
 * Get trend for a single habit over the last 2 weeks vs prior 2 weeks.
 */
function getHabitTrend(habitLogs) {
  const recent = logsInDayRange(habitLogs, 0, 14);
  const prior = logsInDayRange(habitLogs, 14, 28);

  if (recent.length < 2 || prior.length < 2) return null;

  const recentPct = pct(recent.filter((l) => l.status === 'Done').length, recent.length);
  const priorPct = pct(prior.filter((l) => l.status === 'Done').length, prior.length);
  const diff = recentPct - priorPct;

  if (diff >= 15) return { before: priorPct, after: recentPct, direction: 'improving' };
  if (diff <= -15) return { before: priorPct, after: recentPct, direction: 'declining' };
  return null;
}

/**
 * Truncate a string to a maximum length.
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '\u2026' : str;
}

// ============================================================
// Reflections-Based Analysis (uses separate Reflections store)
// ============================================================

/**
 * Generate deep insight cards for a specific item name using structured Reflections data.
 * This is richer than parsing raw log notes — each reflection has clean structured fields.
 *
 * @param {Array}  reflections — all reflections from IndexedDB
 * @param {string} itemName   — filter by this name
 * @returns {Array} insight objects [{title, text, tone}, ...]
 */
function generateInsightsFromReflections(reflections, itemName) {
  if (!reflections || reflections.length === 0) return [];

  const items = itemName
    ? reflections.filter((r) => r.name === itemName)
    : reflections;

  if (items.length === 0) return [];

  const insights = [];

  // ---- Success Strategies ----
  const strategies = items
    .filter((r) => r.strategy && r.strategy.trim())
    .map((r) => r.strategy.trim());

  if (strategies.length > 0) {
    // Deduplicate strategies
    const seen = new Set();
    const unique = strategies.filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const firstEntry = items.find((r) => r.strategy && r.strategy.trim());
    const label = firstEntry && firstEntry.type === 'Habit'
      ? (firstEntry.status === 'Done' ? '💡 What Helped You Succeed' : '💪 Resistance Strategies')
      : '💡 How You Achieved It';

    insights.push({
      title: label,
      text: unique.slice(0, 6).map((s) => `• ${s}`).join('\n'),
      tone: 'positive'
    });
  }

  // ---- Failure Reasons ----
  const failReasons = items
    .filter((r) => r.failReason && r.failReason.trim())
    .map((r) => r.failReason.trim());

  if (failReasons.length > 0) {
    const seenF = new Set();
    const uniqueF = failReasons.filter((s) => {
      const k = s.toLowerCase();
      if (seenF.has(k)) return false;
      seenF.add(k);
      return true;
    });
    insights.push({
      title: '⚠️ Why You Failed',
      text: uniqueF.slice(0, 5).map((s) => `• ${s}`).join('\n'),
      tone: 'negative'
    });
  }

  // ---- Improvement Plans ----
  const betterPlans = items
    .filter((r) => r.betterPlan && r.betterPlan.trim())
    .map((r) => r.betterPlan.trim());

  if (betterPlans.length > 0) {
    const seenB = new Set();
    const uniqueB = betterPlans.filter((s) => {
      const k = s.toLowerCase();
      if (seenB.has(k)) return false;
      seenB.add(k);
      return true;
    });
    insights.push({
      title: '\uD83C\uDF31 How to Do Better',
      text: uniqueB.slice(0, 5).map((s) => `• ${s}`).join('\n'),
      tone: 'warning'
    });
  }

  return insights;
}

/**
 * Get all unique habit/task names that appear in reflections.
 * Used to populate filter dropdowns in the Reflection page.
 * @param {Array} reflections
 * @returns {string[]}
 */
function getReflectionItemNames(reflections) {
  if (!reflections || reflections.length === 0) return [];
  const names = [...new Set(reflections.map((r) => r.name).filter(Boolean))];
  return names.sort();
}
