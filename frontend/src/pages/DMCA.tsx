import React from 'react';

const DMCA: React.FC = () => {
  return (
    <div className="min-h-screen bg-black text-white p-8 md:p-24">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="space-y-4">
          <a href="/" className="text-white/40 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest flex items-center space-x-2">
            <span>← Back to GhostGrab</span>
          </a>
          <h1 className="text-5xl font-extrabold tracking-tighter">DMCA Policy</h1>
          <p className="text-white/40 font-medium">Digital Millennium Copyright Act Notice · Effective May 2026</p>
        </header>

        <section className="space-y-8 text-white/70 leading-relaxed">

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">1. Nature of This Tool</h2>
            <p>
              GhostGrab is a <strong className="text-white">processing utility</strong>, not a content platform.
              It does not host, store, index, or distribute any third-party video content.
              All content downloaded through this tool goes directly to the user's device or temporary session storage
              and is permanently deleted from our servers within 2 hours of the session ending.
            </p>
            <p className="mt-3">
              GhostGrab is designed and intended for use with content that the user owns or has explicit rights to process.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">2. Respect for Copyright</h2>
            <p>
              OneMark respects the intellectual property rights of all creators, platforms, and rights holders.
              We take copyright seriously and actively discourage any use of GhostGrab that would:
            </p>
            <ul className="list-disc ml-8 mt-3 space-y-2">
              <li>Download copyrighted content without the consent of the copyright holder.</li>
              <li>Circumvent platform-level download restrictions or subscription systems.</li>
              <li>Enable unauthorized redistribution of any copyrighted work.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">3. User Responsibility</h2>
            <p>
              GhostGrab is a technical tool. Like a web browser or a video player, the legality of its use
              depends entirely on what the user does with it. Users are solely responsible for:
            </p>
            <ul className="list-disc ml-8 mt-3 space-y-2">
              <li>Ensuring they have the right to download any content they process through this tool.</li>
              <li>Complying with the Terms of Service of YouTube, Instagram, Facebook, and any other platform.</li>
              <li>Complying with applicable copyright law in their jurisdiction.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">4. Copyright Infringement Notice</h2>
            <p>
              If you believe your copyrighted work is being used through GhostGrab in an infringing manner,
              please contact us with the following information:
            </p>
            <ul className="list-disc ml-8 mt-3 space-y-2">
              <li>Your physical or electronic signature as the copyright owner or authorized agent.</li>
              <li>Clear identification of the copyrighted work you claim is being infringed.</li>
              <li>Description of how the infringement is occurring.</li>
              <li>Your contact information (name, address, phone, email).</li>
              <li>A good-faith statement that the use is not authorized by you, by law, or by fair use.</li>
              <li>A statement that the information in your notice is accurate, under penalty of perjury.</li>
            </ul>
            <p className="mt-4">
              Send notices to: <strong className="text-white">hello@onemark.co.in</strong>
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">5. Response to Valid Notices</h2>
            <p>
              Upon receiving a valid DMCA notice, OneMark will investigate promptly and, where technically
              feasible, take appropriate action within our capabilities. Since GhostGrab does not host content
              after session expiry, our primary response is to review whether any feature of the tool
              is being used to systematically infringe, and to address it accordingly.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-3">6. Counter-Notification</h2>
            <p>
              If you believe content was removed or access disabled as a result of a mistaken or
              misidentified DMCA notice, you may submit a counter-notification to hello@onemark.co.in
              with the information required under 17 U.S.C. § 512(g)(3).
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

export default DMCA;
