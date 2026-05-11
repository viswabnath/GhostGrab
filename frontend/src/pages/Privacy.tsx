import React from 'react';

const Privacy: React.FC = () => {
  return (
    <div className="min-h-screen bg-black text-white p-8 md:p-24">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="space-y-4">
          <a href="/" className="text-white/40 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest flex items-center space-x-2">
            <span>← Back to GhostGrab</span>
          </a>
          <h1 className="text-5xl font-extrabold tracking-tighter">Privacy Policy</h1>
          <p className="text-white/40 font-medium">Last updated: May 2026</p>
        </header>

        <section className="space-y-6 text-white/70 leading-relaxed">
          <h2 className="text-2xl font-bold text-white">1. Information We Collect</h2>
          <p>
            GhostGrab is designed with a "Privacy First" philosophy. We do not store any personal data, video URLs, or downloaded content on our permanent servers. All processing happens in transient session directories that are automatically purged.
          </p>
          
          <h2 className="text-2xl font-bold text-white">2. Metadata Scrubbing</h2>
          <p>
            Our primary service is the removal of metadata from digital media. When you process a video through GhostGrab, we strip all EXIF, GPS, and device-specific tracking information to ensure your privacy when re-sharing content.
          </p>

          <h2 className="text-2xl font-bold text-white">3. Third-Party Services</h2>
          <p>
            GhostGrab interacts with third-party platforms like YouTube, Instagram, and Facebook to retrieve content. Your use of these services is governed by their respective privacy policies. We do not share your activity with these platforms beyond what is strictly necessary to fetch the requested media.
          </p>

          <h2 className="text-2xl font-bold text-white">4. Cookies</h2>
          <p>
            We may use local storage to save your preferences, but we do not use tracking cookies or third-party analytics that profile your behavior across the web.
          </p>

          <h2 className="text-2xl font-bold text-white">5. Contact</h2>
          <p>
            If you have questions about our privacy practices, please contact us at: hello@onemark.co.in
          </p>
        </section>

        <footer className="pt-12 border-t border-white/5 text-center">
          <p className="text-white/20 text-xs font-bold uppercase tracking-widest">Powered by OneMark</p>
        </footer>
      </div>
    </div>
  );
};

export default Privacy;
