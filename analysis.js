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
