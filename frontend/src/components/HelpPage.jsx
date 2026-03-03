import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const CATEGORIES = [
  {
    icon: 'rocket_launch',
    title: 'Getting Started',
    description: 'Everything you need to set up your account and start reading.',
  },
  {
    icon: 'record_voice_over',
    title: 'Audio & TTS',
    description: 'Customize voices, control speed, and master audio settings.',
  },
  {
    icon: 'payments',
    title: 'Account & Billing',
    description: 'Manage subscriptions, view invoices, and update payment info.',
  },
  {
    icon: 'build',
    title: 'Troubleshooting',
    description: 'Solutions for common issues, sync problems, and playback errors.',
  },
];

const ARTICLES = [
  {
    title: 'How to change TTS speed and pitch?',
    description: 'Learn how to fine-tune your voice generation for the perfect narration.',
  },
  {
    title: 'Getting started with your first book',
    description: 'A step-by-step guide to adding and listening to your first audiobook.',
  },
  {
    title: 'Managing your subscription',
    description: 'How to upgrade, downgrade, or cancel your subscription.',
  },
  {
    title: 'Troubleshooting sync issues',
    description: 'Solutions for common sync problems across devices.',
  },
];

const POPULAR_LINKS = ['TTS Settings', 'Billing cycle', 'Voice speed'];

export default function HelpPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return ARTICLES;
    const q = searchQuery.toLowerCase().trim();
    return ARTICLES.filter((a) => a.title.toLowerCase().includes(q));
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-background-dark pb-16">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background-dark/80 border-b border-border-dark backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 h-16">
            <button
              onClick={() => navigate('/library')}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-surface transition-colors"
              aria-label="Back to library"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-white">Help & Support</h1>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <section className="text-center mb-16">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 tracking-tight">
            How can we help?
          </h2>
          <div className="max-w-2xl mx-auto relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-slate-400">search</span>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search our knowledge base..."
              className="block w-full pl-12 pr-4 py-4 bg-slate-800 border border-slate-700 rounded-xl text-lg text-white placeholder:text-slate-500 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
            />
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm text-slate-400">
              <span>Popular:</span>
              {POPULAR_LINKS.map((label) => (
                <button
                  key={label}
                  onClick={() => setSearchQuery(label)}
                  className="hover:text-primary underline decoration-primary/30 underline-offset-2 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Category Grid */}
        <section className="mb-20">
          <h3 className="text-2xl font-bold text-white mb-8">Browse Categories</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CATEGORIES.map((cat) => (
              <div
                key={cat.title}
                className="group p-6 bg-slate-800/50 border border-slate-800 rounded-xl hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined">{cat.icon}</span>
                </div>
                <h4 className="text-lg font-bold text-white mb-2">{cat.title}</h4>
                <p className="text-slate-400 text-sm">{cat.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Featured Articles + Contact */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-primary">article</span>
              <h3 className="text-2xl font-bold text-white">Featured Articles</h3>
            </div>
            <div className="space-y-4">
              {filteredArticles.length === 0 ? (
                <p className="text-slate-400 py-8 text-center">No articles match your search.</p>
              ) : (
                filteredArticles.map((article) => (
                  <div
                    key={article.title}
                    className="flex justify-between items-center p-5 bg-slate-800 border border-slate-800 rounded-xl hover:bg-slate-700/50 transition-colors cursor-default"
                  >
                    <div>
                      <h4 className="font-semibold text-white mb-1">{article.title}</h4>
                      <p className="text-sm text-slate-400">{article.description}</p>
                    </div>
                    <span className="material-symbols-outlined text-slate-400">chevron_right</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Contact Support Card */}
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-8 flex flex-col items-center text-center lg:sticky lg:top-24">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-primary text-2xl">support_agent</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Still need help?</h3>
            <p className="text-slate-400 mb-8 leading-relaxed">
              Can&apos;t find what you&apos;re looking for? Our dedicated support team is available 24/7 to assist you.
            </p>
            <button
              type="button"
              className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">mail</span>
              Contact Support
            </button>
            <div className="mt-6 flex flex-col gap-2 w-full">
              <div className="flex items-center justify-between text-sm text-slate-400 px-2">
                <span>Response time:</span>
                <span className="font-medium text-slate-200">&lt; 2 hours</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-400 px-2">
                <span>Available via:</span>
                <span className="font-medium text-slate-200">Email, Chat</span>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-20 pt-12 border-t border-slate-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-sm text-slate-400">Version 2.4.0</p>
            <div className="flex gap-8 text-sm text-slate-400">
              <a href="#" className="hover:text-primary transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-primary transition-colors">
                Privacy
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
