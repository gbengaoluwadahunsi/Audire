import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Book, Headphones, Zap, Shield, ArrowRight, Sparkles, Sun, Moon } from 'lucide-react';
import { getSettings, saveSettings } from '../lib/settings';

function LandingPage({ onEnter }) {
  const [theme, setTheme] = useState(() => getSettings().theme || 'dark');

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    const s = getSettings();
    saveSettings({ ...s, theme: nextTheme });
    document.documentElement.classList.toggle('light', nextTheme === 'light');
  };

  return (
    <div className="landing">
      {/* Background */}
      <div className="landing-bg">
        <div className="landing-gradient" />
        <div className="landing-mesh" />
        <div className="landing-glow landing-glow-1" />
        <div className="landing-glow landing-glow-2" />
      </div>

      {/* Header */}
      <header className="landing-header">
        <div className="landing-logo">
          <img src="/logo.svg" alt="Audire" className="landing-logo-icon" />
          <span>Audire</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button
            onClick={toggleTheme}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', padding: '8px' }}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button className="landing-cta-nav" onClick={onEnter}>
            Open Library
            <ArrowRight size={18} />
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <motion.div
          className="landing-hero-badge"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Sparkles size={14} />
          <span>Podcast-quality TTS in your browser</span>
        </motion.div>

        <motion.h1
          className="landing-hero-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Read with your ears.
          <br />
          <span className="landing-hero-accent">Listen like a podcast.</span>
        </motion.h1>

        <motion.p
          className="landing-hero-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Podcast-quality TTS, AI-powered explain and flashcards, EPUB and PDF —
          a reading experience that listens, explains, and helps you learn.
        </motion.p>

        <motion.div
          className="landing-hero-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <button className="landing-btn-primary" onClick={onEnter}>
            Get Started
            <ArrowRight size={20} />
          </button>
          <button className="landing-btn-secondary" onClick={onEnter}>
            Open Library
          </button>
        </motion.div>
      </section>

      {/* Features */}
      <section className="landing-features">
        <motion.div
          className="landing-feature"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="landing-feature-icon">
            <Headphones size={24} />
          </div>
          <h3>Podcast-quality TTS</h3>
          <p>Neural voices that sound natural. Listen to any EPUB or PDF like an audiobook.</p>
        </motion.div>

        <motion.div
          className="landing-feature"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="landing-feature-icon">
            <Sparkles size={24} />
          </div>
          <h3>AI reading assistant</h3>
          <p>Explain, define, summarize, and generate flashcards from your text.</p>
        </motion.div>

        <motion.div
          className="landing-feature"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="landing-feature-icon">
            <Book size={24} />
          </div>
          <h3>EPUB & PDF</h3>
          <p>Highlights, bookmarks, and progress sync. Your library, your way.</p>
        </motion.div>
      </section>

      {/* Footer CTA */}
      <footer className="landing-footer">
        <p>Ready to listen?</p>
        <button className="landing-btn-primary landing-btn-large" onClick={onEnter}>
          Enter Dashboard
          <ArrowRight size={20} />
        </button>
      </footer>
    </div>
  );
}

export default LandingPage;
