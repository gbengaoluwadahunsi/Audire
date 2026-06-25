/**
 * listeningGoal.js — lightweight per-day listening tracker for the daily goal.
 *
 * Time is accumulated locally (responsive, offline-friendly) while TTS plays.
 * When the goal is reached we fire a one-per-day PWA notification (if enabled
 * and permitted). True scheduled reminders aren't possible on the web without a
 * push server, so this is an in-app/while-open reminder by design.
 */

import { getSettings } from './settings';

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const secKey = () => `audire-listen-sec-${todayKey()}`;
const notifiedKey = () => `audire-goal-notified-${todayKey()}`;

export function getTodaySeconds() {
  try {
    return Math.max(0, parseInt(localStorage.getItem(secKey()), 10) || 0);
  } catch {
    return 0;
  }
}

export function addListeningSeconds(seconds) {
  if (!seconds || seconds <= 0) return getTodaySeconds();
  let total = getTodaySeconds() + seconds;
  try {
    localStorage.setItem(secKey(), String(total));
  } catch {
    /* ignore */
  }
  maybeNotifyGoal();
  return total;
}

export function getGoalMinutes() {
  const g = getSettings().dailyGoalMinutes;
  const n = Number(g);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function getGoalProgress() {
  const goalMin = getGoalMinutes();
  const seconds = getTodaySeconds();
  const minutes = seconds / 60;
  return {
    seconds,
    minutes,
    goalMinutes: goalMin,
    percent: Math.min(100, Math.round((minutes / goalMin) * 100)),
    reached: minutes >= goalMin,
  };
}

export async function ensureNotificationPermission() {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}

function showNotification(title, body) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' });
      }).catch(() => { new Notification(title, { body }); });
    } else {
      new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}

export function maybeNotifyGoal() {
  const settings = getSettings();
  if (!settings.remindersEnabled) return;
  const { reached } = getGoalProgress();
  if (!reached) return;
  try {
    if (localStorage.getItem(notifiedKey())) return;
    localStorage.setItem(notifiedKey(), '1');
  } catch {
    return;
  }
  showNotification('Daily goal reached! 🎧', `You hit your ${getGoalMinutes()}-minute listening goal today. Keep the streak going!`);
}
