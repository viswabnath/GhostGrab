import React from 'react';

const Terms: React.FC = () => {
  return (
    <div className="min-h-screen bg-black text-white p-8 md:p-24">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="space-y-4">
          <a href="/" className="text-white/40 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest flex items-center space-x-2">
            <span>← Back to GhostGrab</span>
          </a>
          <h1 className="text-5xl font-extrabold tracking-tighter">Terms of Service</h1>
          <p className="text-white/40 font-medium">Effective Date: May 2026 · Jurisdiction: India</p>
        </header>

        <section className="space-y-8 text-white/70 leading-relaxed">

          <div className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/10">
            <p className="text-amber-300 font-bold text-sm uppercase tracking-widest mb-2">⚠ Important Notice</p>
            <p className="text-amber-200/80">
              GhostGrab is designed exclusively for processing content that you own or have obtained explicit rights to use.
              Using this tool to download third-party copyrighted content without permission may violate copyright law and
              the Terms of Service of the respective platform. <strong className="text-amber-300">You bear full legal responsibility for how you use this tool.</strong>
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">1. Intended Use</h2>
            <p>
              GhostGrab is a media workflow utility developed by <strong className="text-white">OneMark Digital Agency</strong> for internal professional use.
              Its intended purpose is to help content creators and digital agencies:
            </p>
            <ul className="list-disc ml-8 mt-3 space-y-2">
              <li>Process and manage video content they own or have explicit rights to.</li>
              <li>Strip tracking metadata from their own media files for privacy and clean re-publishing.</li>
              <li>Convert media to cross-platform formats (H.264/MP4) for YouTube re-upload workflows.</li>
              <li>Download publicly available content that is explicitly licensed for free distribution (Creative Commons, public domain, etc.).</li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">2. Prohibited Uses</h2>
            <p>You expressly agree <strong className="text-white">not</strong> to use GhostGrab to:</p>
            <ul className="list-disc ml-8 mt-3 space-y-2">
              <li>Download copyrighted content from YouTube, Instagram, Facebook, or any platform without the explicit permission of the copyright holder.</li>
              <li>Circumvent or bypass the Terms of Service, technical measures, or subscription systems of any third-party platform.</li>
              <li>Redistribute, resell, or commercially exploit any third-party content obtained through this tool.</li>
              <li>Access content you are not otherwise legally permitted to view or download.</li>
              <li>Engage in bulk scraping, automated harvesting, or any activity that violates a platform's robots.txt or Terms of Service.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">3. Your Responsibility</h2>
            <p>
              You are solely and entirely responsible for:
            </p>
            <ul className="list-disc ml-8 mt-3 space-y-2">
              <li>Verifying that you have the legal right to download any content before using GhostGrab.</li>
              <li>Ensuring your use complies with the copyright laws of your jurisdiction.</li>
              <li>Ensuring your use complies with the Terms of Service of any third-party platform.</li>
              <li>Any consequences, legal or otherwise, arising from your use of this tool.</li>
            </ul>
            <p className="mt-3">
              OneMark accepts no liability for your use of GhostGrab and makes no representation that any specific use is legally permissible.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">4. No Endorsement of ToS Violations</h2>
            <p>
              GhostGrab does not encourage, endorse, or facilitate violations of any platform's Terms of Service.
              The mention of YouTube, Instagram, or Facebook within this tool is for technical reference only and does not imply
              any affiliation with or approval by those companies. Downloading content from those platforms without their permission
              or the copyright holder's permission is a violation of their Terms of Service and potentially of applicable law.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">5. Intellectual Property</h2>
            <p>
              GhostGrab software, branding, and underlying technology are the intellectual property of OneMark.
              GhostGrab does not claim ownership of any content processed through it.
              All processed content remains the property of its respective copyright owners.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">6. Disclaimer of Warranties</h2>
            <p>
              GhostGrab is provided "as is" without warranty of any kind. OneMark makes no warranties, express or implied,
              regarding the legality of any specific use case, the accuracy of this tool's output, or its fitness for any particular purpose.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, OneMark shall not be liable for any direct, indirect, incidental,
              special, consequential, or exemplary damages arising from your use of GhostGrab, including but not limited to
              copyright infringement claims, platform account suspension, or data loss.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">8. Governing Law</h2>
            <p>
              These Terms are governed by the laws of India, specifically the Information Technology Act 2000,
              the Copyright Act 1957 (as amended), and applicable judicial precedent.
              Any disputes shall be subject to the exclusive jurisdiction of courts in India.
            </p>
          </div>

        </section>

        <footer className="pt-12 border-t border-white/5 text-center">
          <p className="text-white/20 text-xs font-bold uppercase tracking-widest">© 2026 OneMark Digital Agency · hello@onemark.co.in</p>
        </footer>
      </div>
    </div>
  );
};

export default Terms;
