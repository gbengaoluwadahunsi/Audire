import React, { useState, useEffect } from 'react';
import { Loader2, BookOpen, Clock, Flame, TrendingUp, Target, Edit2, Check } from 'lucide-react';
import { getReadingSummary } from '../lib/api';
import { getGoalProgress, getGoalMinutes } from '../lib/listeningGoal';
import { getSettings, saveSettings } from '../lib/settings';

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function StatsDashboard({ addToast }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(() => String(getGoalMinutes()));
  const [goal, setGoal] = useState(() => getGoalProgress());

  useEffect(() => {
    loadSummary();
  }, [period]);

  // Refresh goal progress every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setGoal(getGoalProgress()), 30_000);
    return () => clearInterval(id);
  }, []);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const data = await getReadingSummary(period);
      setSummary(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
      addToast?.('Failed to load reading statistics', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoalSave = () => {
    const v = parseInt(goalInput, 10);
    if (!v || v < 1 || v > 1440) {
      addToast?.('Please enter a valid number of minutes (1–1440)', 'error');
      setGoalInput(String(getGoalMinutes()));
      setEditingGoal(false);
      return;
    }
    const s = getSettings();
    saveSettings({ ...s, dailyGoalMinutes: v });
    setGoal(getGoalProgress());
    setEditingGoal(false);
    addToast?.(`Daily goal set to ${v} minutes`, 'success');
  };

  if (loading) {
    return (
      <div className="dashboard-stats">
        <div className="dashboard-loader">
          <Loader2 size={24} className="spin" />
          <span>Loading stats...</span>
        </div>
      </div>
    );
  }

  const total = summary?.total || {};
  const daily = summary?.daily || [];
  const streak = summary?.streak || 0;
  const goalDeg = Math.round((goal.percent / 100) * 360);

  const maxMinutes = Math.max(
    ...daily.map(d => Math.round(d.seconds / 60)),
    1
  );

  return (
    <div className="dashboard-stats">
      <div className="dashboard-stats-header">
        <h2>Reading Statistics</h2>
        <select
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
          className="dashboard-settings-select"
          style={{ width: 'auto' }}
          aria-label="Stats time period"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      {/* ── Daily Goal Card ── */}
      <div className={`stats-goal-card ${goal.reached ? 'reached' : ''}`}>
        <div
          className="stats-goal-ring"
          style={{ background: `conic-gradient(var(--primary) ${goalDeg}deg, var(--border) ${goalDeg}deg)` }}
        >
          <div className="stats-goal-ring-inner">
            <Target size={18} />
            <span className="stats-goal-percent">{goal.percent}%</span>
          </div>
        </div>
        <div className="stats-goal-info">
          <div className="stats-goal-info-title">
            <h3>Today's Goal</h3>
            {!editingGoal ? (
              <button
                className="stats-goal-edit-btn"
                onClick={() => { setGoalInput(String(goal.goalMinutes)); setEditingGoal(true); }}
                title="Edit daily goal"
              >
                <Edit2 size={14} />
              </button>
            ) : (
              <button className="stats-goal-edit-btn active" onClick={handleGoalSave} title="Save">
                <Check size={14} />
              </button>
            )}
          </div>
          {editingGoal ? (
            <div className="stats-goal-edit-row">
              <input
                type="number"
                className="stats-goal-input"
                value={goalInput}
                min={1}
                max={1440}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGoalSave()}
                autoFocus
              />
              <span className="stats-goal-unit">min / day</span>
            </div>
          ) : (
            <p>
              {Math.round(goal.minutes)} of {goal.goalMinutes} min
              {goal.reached ? ' — goal reached! 🎉' : ''}
            </p>
          )}
        </div>
        {goal.reached && <div className="stats-goal-confetti">🎉</div>}
      </div>

      {/* ── Streak Banner (if streak > 1) ── */}
      {streak > 1 && (
        <div className="stats-streak-banner">
          <span className="stats-streak-fire">🔥</span>
          <div className="stats-streak-text">
            <strong>{streak}-day streak!</strong>
            <span>Keep it up — you're on fire!</span>
          </div>
        </div>
      )}

      {/* ── Summary Cards ── */}
      <div className="stats-cards">
        <div className={`stats-card ${streak > 0 ? 'streak-active' : ''}`}>
          <div className="stats-card-icon">
            <Flame size={24} />
          </div>
          <div className="stats-card-content">
            <div className="stats-card-value">{streak}</div>
            <div className="stats-card-label">Day Streak</div>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-card-icon">
            <Clock size={24} />
          </div>
          <div className="stats-card-content">
            <div className="stats-card-value">{formatDuration(total.total_seconds)}</div>
            <div className="stats-card-label">Total Time</div>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-card-icon">
            <BookOpen size={24} />
          </div>
          <div className="stats-card-content">
            <div className="stats-card-value">{total.total_pages || 0}</div>
            <div className="stats-card-label">Pages Read</div>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-card-icon">
            <TrendingUp size={24} />
          </div>
          <div className="stats-card-content">
            <div className="stats-card-value">{total.active_days || 0}</div>
            <div className="stats-card-label">Active Days</div>
          </div>
        </div>
      </div>

      <div className="stats-chart-section">
        <h3>Daily Reading</h3>
        {daily.length === 0 ? (
          <div className="stats-empty">
            <p>No reading sessions recorded yet. Start reading to track your progress!</p>
          </div>
        ) : (
          <div className="stats-chart">
            {daily.slice(0, 14).reverse().map((day, i) => {
              const minutes = Math.round(day.seconds / 60);
              const heightPct = Math.max(4, (minutes / maxMinutes) * 100);
              const date = new Date(day.day);
              const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const isToday = new Date().toDateString() === date.toDateString();
              return (
                <div key={i} className="stats-chart-bar-wrapper" title={`${label}: ${minutes}min, ${day.pages} pages`}>
                  <div className={`stats-chart-bar ${isToday ? 'today' : ''}`} style={{ height: `${heightPct}%` }}>
                    <span className="stats-chart-value">{minutes > 0 ? `${minutes}m` : ''}</span>
                  </div>
                  <span className="stats-chart-label">{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {daily.length > 0 && (
        <div className="stats-recent-section">
          <h3>Recent Sessions</h3>
          <div className="stats-recent-list">
            {daily.slice(0, 7).map((day, i) => {
              const date = new Date(day.day);
              return (
                <div key={i} className="stats-recent-item">
                  <span className="stats-recent-date">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="stats-recent-sessions">{day.sessions} session{day.sessions !== 1 ? 's' : ''}</span>
                  <span className="stats-recent-time">{formatDuration(day.seconds)}</span>
                  <span className="stats-recent-pages">{day.pages} pages</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
