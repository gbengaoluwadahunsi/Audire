/**
 * Landing page — converted from designs/homepage/code.html
 */
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';

const CheckIcon = () => (
  <svg className="w-5 h-5 text-brand shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path clipRule="evenodd" fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
  </svg>
);

export default function LandingPage() {
  const navigate = useNavigate();
  const goToLibrary = () => navigate('/library');

  return (
    <div className="min-h-screen bg-brand-charcoal font-sans antialiased selection:bg-brand selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-effect" data-purpose="main-navigation">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Logo className="text-white" />
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a className="hover:text-white transition-colors" href="#features">Features</a>
            <button type="button" onClick={goToLibrary} className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold transition-all shadow-lg shadow-primary/20">
              Go to Library
            </button>
          </div>
          <button type="button" className="md:hidden text-slate-400" data-purpose="mobile-menu-toggle" aria-label="Menu">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16m-7 6h7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          </button>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden hero-gradient" data-purpose="hero">
          <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-semibold tracking-wider">
                <span>Neural TTS · Start free, no card required</span>
              </div>
              <h1 className="text-3xl lg:text-4xl xl:text-5xl font-serif font-bold text-white leading-[1.1] tracking-tight">
                Your books. <br />
                <span className="text-primary">Human-like narration.</span> <br />
                One app.
              </h1>
              <p className="text-base lg:text-lg text-slate-400 max-w-lg leading-relaxed">
                Turn any PDF or EPUB into an audiobook in seconds. Read with your eyes, listen with your ears—same place, zero ads.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button type="button" onClick={goToLibrary} className="px-8 py-4 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl transition-all shadow-xl shadow-primary/25 hover:shadow-primary/30 hover:-translate-y-0.5">
                  Start reading free
                </button>
                <a href="#features" className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-all border border-white/10 text-center">
                  See features
                </a>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <div className="flex -space-x-2">
                  <img alt="User" className="w-8 h-8 rounded-full border-2 border-brand-charcoal" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDRforGVCanVzxZmf7gOzn4MjWwhd-tDhCvx9oYHwwgynmkuTOFisSoOZ0Vhafc4lsP0dURXa53hRg40VVqYp7Lxfky0vW9T3M9ZNX9jnGbPsIxb3126z65hZd_wUwuE9iliRlSNO89djhcXV0NDSkbFy4tbbtwrGeEqef078PAPyZ5eCMPJFhWWkXe2_vDeOc2LQa77-1rQfh0QtmbI3_hEmNW6rDofoVq5o4xrGWpA1qK_1fkpCMR6cekzGFTuHEmYuyW80deAVxw" />
                  <img alt="User" className="w-8 h-8 rounded-full border-2 border-brand-charcoal" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2orvYCenZpwpgdFT27eo1biCBDridFPMIv7w7Mu68gD_9zgHn9SieP9oxdBjmxjzD7geCa-VENx5YU7lcHzCOyp5CdWURENWFGDTwoQNTKhC57uCvBP85MQiQgzv-OI2EXUc2bpWEPTiu38uKIAVNJIB19TCQNWQmutSjrSZXSDkgNUhF51fTqQ5td9pCF75xoGQIjB5AIta2w3bcHUdYARCN0PajZGAVXrf85jrxpvCeUSTEbiEw0kmJe5w-r_ejljB9otlW31R7" />
                  <img alt="User" className="w-8 h-8 rounded-full border-2 border-brand-charcoal" src="https://lh3.googleusercontent.com/aida-public/AB6AXuANxbBK0rJ67KrHpvkjFDVaM07zRAYKCSXE3JAQD6ytQ4PRhUwHal7-6jyQyuYID3fFuBmFV7kN7uhaI7_vLtFEXPLtO1SgkptCeDzODznBVr8JNXvgK-LC_5ER3UvxbBvKLrn0dc4aOkhz_Oiu0d_UIg__b5_nGcADz-_Uef40C_uKPdP2qsYfMkSatg3KyWpO5xQRBckBmjn3oGXHhbv6098VsLd4J8F31LZKO5FDgySbkzz9C2bXwzxh4qOs4ndWGig8P8RhKSXJ" />
                </div>
                <span><strong className="text-slate-400">10,000+</strong> readers already listening</span>
              </div>
            </div>
            {/* Hero Mockup */}
            <div className="relative hero-mockup-glow" data-purpose="hero-mockup">
              <div className="absolute -inset-8 bg-primary/25 blur-[100px] rounded-full animate-pulse-slow" />
              <div className="relative glass-effect rounded-2xl p-4 shadow-2xl transform rotate-2 ring-1 ring-white/5">
                <div className="bg-brand-charcoal rounded-xl overflow-hidden aspect-3/4 border border-white/5 flex flex-col">
                  <div className="p-4 border-b border-white/5 flex justify-between items-center bg-brand-charcoal">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500/50" />
                      <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                      <div className="w-2 h-2 rounded-full bg-green-500/50" />
                    </div>
                    <div className="text-[10px] text-gray-500 font-medium">Chapter IV: The Silent Sea</div>
                    <div className="w-4 h-4 text-gray-500">
                      <svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                    </div>
                  </div>
                  <div className="p-8 flex-1 font-serif text-gray-300 space-y-4 overflow-y-auto overflow-x-hidden min-h-0">
                    <h2 className="text-2xl text-white mb-6">The Echo of Silence</h2>
                    <p className="text-sm leading-relaxed opacity-80">
                      The morning mist clung to the rugged cliffs of Moher like a forgotten memory. Ewan stood at the edge, the salt spray cooling his weathered face. It had been years since he last heard the melody of the deep, yet here he was, drawn back by a whisper that only he could perceive.
                    </p>
                    <p className="text-sm leading-relaxed opacity-80">
                      Beneath the waves, a different world breathed. A world of turquoise shadows and ancient rhythms. He adjusted his glasses, the serif font on his digital tablet glowing softly against the dimming light of the horizon.
                    </p>
                    <p className="text-sm leading-relaxed opacity-80">
                      The lighthouse keeper had told him that the old stories were true—that the sea kept voices in its depths, and that those who listened long enough could hear them still. Ewan had dismissed it as folklore. Now he was less certain.
                    </p>
                    <p className="text-sm leading-relaxed opacity-80">
                      A gull cried out above. He watched it wheel and dip, a speck against the bruised evening sky. Somewhere below, in the cold and the dark, something moved. Or perhaps it was only the tide, turning the stones.
                    </p>
                    <p className="text-sm leading-relaxed opacity-80">
                      He had come here to finish what he had started decades ago. The manuscript in his bag—yellowed, fragile—was the last piece. If the stories were true, the echo of silence was not an absence of sound but a kind of listening. And he was ready, at last, to hear.
                    </p>
                  </div>
                  <div className="p-6 bg-brand/5 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button type="button" className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white shadow-lg shadow-brand/40">
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </button>
                      <div className="h-1 w-32 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full w-1/3 bg-brand" />
                      </div>
                    </div>
                    <span className="text-[10px] text-brand font-bold">NEURAL VOICE: CLARA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="py-8 border-y border-white/5 bg-black/20" data-purpose="trust-strip">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <p className="text-lg text-slate-300 italic">&ldquo;Finally, an app that reads my PDFs in a voice that doesn&apos;t put me to sleep. I listen during my commute every day.&rdquo;</p>
            <p className="mt-3 text-sm text-slate-500">— Sarah K., product designer · <span className="text-secondary-green font-medium">Audire Pro</span></p>
          </div>
        </section>

        {/* Listen with Intelligence */}
        <section className="py-24 bg-brand-charcoal" data-purpose="features-neural" id="features">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div className="order-2 lg:order-1 relative">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4 pt-12">
                    <div className="p-6 glass-effect rounded-custom border border-brand/20">
                      <div className="w-10 h-10 rounded-custom bg-brand/20 flex items-center justify-center mb-4 text-brand">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                      </div>
                      <h4 className="font-bold text-white mb-2">Natural Cadence</h4>
                      <p className="text-sm text-gray-400">Voices that breathe, pause, and emphasize like a real narrator.</p>
                    </div>
                    <div className="p-6 glass-effect rounded-custom border border-secondary-purple/20">
                      <div className="w-10 h-10 rounded-custom bg-secondary-purple-muted flex items-center justify-center mb-4 text-secondary-purple">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                      </div>
                      <h4 className="font-bold text-white mb-2">Tone Control</h4>
                      <p className="text-sm text-slate-400">Adjust the emotional depth and speed of the narration.</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="p-6 glass-effect rounded-custom">
                      <div className="w-10 h-10 rounded-custom bg-primary/20 flex items-center justify-center mb-4 text-primary">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                      </div>
                      <h4 className="font-bold text-white mb-2">Multilingual</h4>
                      <p className="text-sm text-slate-400">Support for over 40 languages with native-level fluency.</p>
                    </div>
                    <div className="p-6 glass-effect rounded-custom border border-secondary-green/20">
                      <div className="w-10 h-10 rounded-custom bg-secondary-green-muted flex items-center justify-center mb-4 text-secondary-green">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                      </div>
                      <h4 className="font-bold text-white mb-2">Neural Engine</h4>
                      <p className="text-sm text-slate-400">Powered by cutting-edge AI for crystal-clear fidelity.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2 space-y-6">
                <h2 className="text-2xl lg:text-3xl font-serif font-bold text-white leading-tight">Listen with Intelligence</h2>
                <p className="text-lg text-gray-400 leading-relaxed">
                  Our proprietary neural engine doesn&apos;t just read words—it tells stories. Experience a range of studio-quality voices that capture the nuance of every sentence, making audiobooks indistinguishable from human narration.
                </p>
                <ul className="space-y-4">
                  <li className="flex items-center gap-3 text-slate-300"><CheckIcon />Context-aware pronunciation</li>
                  <li className="flex items-center gap-3 text-slate-300"><CheckIcon />Dynamic character voicing</li>
                  <li className="flex items-center gap-3 text-slate-300"><CheckIcon />Adaptive background atmosphere</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Designed for Focus */}
        <section className="py-24 bg-brand-slate overflow-hidden" data-purpose="features-ui" id="interface">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-2xl lg:text-3xl font-serif font-bold text-white mb-6">Designed for Focus</h2>
              <p className="text-gray-400">A minimal interface that disappears, leaving only you and your story. No ads, no notifications, just pure literary immersion.</p>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-brand/5 rounded-[40px] transform -rotate-1" />
              <div className="relative bg-brand-charcoal p-8 lg:p-12 rounded-[40px] border border-white/5 shadow-2xl">
                <div className="grid lg:grid-cols-3 gap-12">
                  <div className="space-y-6">
                    <div className="h-12 w-12 bg-white/5 rounded-lg flex items-center justify-center text-brand">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    </div>
                    <h3 className="text-2xl font-serif text-white">Eye-Comfort Modes</h3>
                    <p className="text-gray-400">Choose from sepia, dark, or night-shift modes to reduce eye strain during late-night reading sessions.</p>
                  </div>
                  <div className="space-y-6">
                    <div className="h-12 w-12 bg-white/5 rounded-lg flex items-center justify-center text-brand">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    </div>
                    <h3 className="text-2xl font-serif text-white">Typography Perfected</h3>
                    <p className="text-gray-400">Fully adjustable margins, line-spacing, and font sizes featuring premium serif typefaces for maximum legibility.</p>
                  </div>
                  <div className="space-y-6">
                    <div className="h-12 w-12 bg-white/5 rounded-lg flex items-center justify-center text-brand">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    </div>
                    <h3 className="text-2xl font-serif text-white">Smart Annotations</h3>
                    <p className="text-gray-400">Highlight passages and record voice notes that automatically sync to your favorite productivity apps.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Read Anywhere */}
        <section className="py-24 bg-brand-charcoal" data-purpose="features-sync" id="anywhere">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col lg:flex-row gap-16 items-center">
              <div className="lg:w-1/2 space-y-8">
                <h2 className="text-2xl lg:text-3xl font-serif font-bold text-white">Read Anywhere, <br />Synchronized Everywhere</h2>
                <p className="text-lg text-gray-400 leading-relaxed">
                  Audire is a Progressive Web App (PWA) that lives on all your devices. Start reading on your desktop and pick up exactly where you left off on your phone—even when you&apos;re offline.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="flex gap-4 items-start">
                    <div className="p-2 bg-brand/10 text-brand rounded-lg">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Cloud Sync</h4>
                      <p className="text-sm text-gray-500">Real-time progress synchronization.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="p-2 bg-brand/10 text-brand rounded-lg">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-white">PWA Ready</h4>
                      <p className="text-sm text-gray-500">Install as an app on iOS and Android.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="p-2 bg-brand/10 text-brand rounded-lg">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Offline Access</h4>
                      <p className="text-sm text-gray-500">Download books for data-free reading.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="p-2 bg-brand/10 text-brand rounded-lg">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-white">Reading History</h4>
                      <p className="text-sm text-gray-500">Visualize your library and stats.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="lg:w-1/2">
                <div className="relative flex justify-center">
                  <div className="relative w-64 h-[400px] bg-brand-slate rounded-[32px] border-4 border-gray-800 shadow-2xl z-10 overflow-hidden transform -rotate-6">
                    <img alt="Book cover - The Great Gatsby" className="w-full h-full object-cover opacity-90" src="https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg" />
                  </div>
                  <div className="absolute bottom-[-20px] left-[50%] w-64 h-[400px] bg-brand-slate rounded-[32px] border-4 border-gray-800 shadow-2xl z-20 overflow-hidden transform translate-x-[-10%] rotate-6">
                    <img alt="Book cover - Pride and Prejudice" className="w-full h-full object-cover" src="https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Bottom */}
        <section className="py-24 bg-primary" data-purpose="cta-bottom">
          <div className="max-w-5xl mx-auto px-6 text-center">
            <h2 className="text-2xl lg:text-3xl font-serif font-bold text-white mb-6">Ready to read—and listen?</h2>
            <p className="text-blue-100 text-xl mb-10 max-w-2xl mx-auto">
              Join 10,000+ readers. Start free, no credit card. Syncs everywhere.
            </p>
            <button type="button" onClick={goToLibrary} className="px-10 py-5 bg-white text-primary font-bold text-lg rounded-xl hover:shadow-2xl hover:bg-slate-50 transition-all hover:-translate-y-1">
              Get started free
            </button>
            <p className="mt-5 text-sm text-blue-200/90">Cancel anytime. Your library stays yours.</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-brand-charcoal py-16 border-t border-white/5" data-purpose="footer">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-16">
            <div className="col-span-2 lg:col-span-2">
              <div className="mb-6">
                <Logo className="text-white" />
              </div>
              <p className="text-slate-400 max-w-sm mb-6">
                Elevating the digital reading experience through artificial intelligence and minimalist design.
              </p>
              <div className="flex gap-4">
                <a className="text-slate-500 hover:text-primary transition-colors" href="#"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" /></svg></a>
                <a className="text-slate-500 hover:text-primary transition-colors" href="#"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg></a>
              </div>
            </div>
            <div>
              <h5 className="text-white font-bold mb-6">Product</h5>
              <ul className="space-y-4 text-slate-400 text-sm">
                <li><a className="hover:text-primary transition-colors" href="#features">Features</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Voices</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Integrations</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-white font-bold mb-6">Company</h5>
              <ul className="space-y-4 text-slate-400 text-sm">
                <li><a className="hover:text-primary transition-colors" href="#">About</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Careers</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Privacy</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Terms</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-white font-bold mb-6">Support</h5>
              <ul className="space-y-4 text-slate-400 text-sm">
                <li><a className="hover:text-primary transition-colors" href="#">Help Center</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Documentation</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">API</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
            <p>© 2025 Audire. All rights reserved.</p>
            <div className="flex gap-8">
              <span>English (US)</span>
              <span>Status: All Systems Operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
