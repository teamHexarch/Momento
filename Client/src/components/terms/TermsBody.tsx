export default function TermsBody() {
  return (
    <>
      <header className="top">
        <a className="brand" href="/"><img src="assets/momento-icon.png" alt="" />Momento</a>
        <a className="back" href="/">Back to Momento</a>
      </header>

      <main>
        <h1>Terms of Service</h1>
        <p className="updated">Last updated 26 November 2026</p>
        {/* LEGAL REVIEW: these terms were rewritten for Australian law on 26 November 2026 and have not yet been
            checked by a lawyer (in particular the consumer-law wording, liability, governing law and the takedown
            process). Remove the draft note below once they have been reviewed and approved. */}
        <p className="draft-note" role="note"><strong>Draft:</strong> these updated terms are waiting for a legal review and may still change.</p>

        <p className="lede">These terms are the agreement between you and HexArch Limited, which runs Momento (momento.hexarch.org) from Victoria, Australia. By creating an account or using Momento you agree to them, and to our <a href="privacy">Privacy policy</a>. They&apos;re written to be short and plain. Nothing in them takes away rights you have under the Australian Consumer Law or the consumer laws where you live.</p>

        <h2>The service</h2>
        <p>Momento gives each event one shared photo album: the host creates it, guests join with a code, link or QR code, and everyone adds, comments on and reacts to photos. Events can also have games (polls, quizzes, photo battles, scavenger bingo, mystery crop and photo competitions) with a leaderboard. Momento is free to use. We may change or stop features, and we&apos;ll tell you in good time before anything that affects your photos.</p>

        <h2>Who can use Momento</h2>
        <p>You must be <strong>at least 13 years old</strong> to create an account. If you&apos;re under 18 (or the age of adulthood where you live), you need your parent or guardian&apos;s permission. You confirm this when you sign up. If we learn an account belongs to someone under 13, we delete it.</p>

        <h2>Your account</h2>
        <ul>
          <li>Keep your password private and use an email address you can access. You&apos;re responsible for what happens in your account.</li>
          <li>An account can be logged in on a limited number of devices at once; you can see and sign out your devices in Settings.</li>
          <li>Tell us straight away at <a href="mailto:team@hexarch.org">team@hexarch.org</a> if you think someone else has used it.</li>
          <li>You can change your details, download your data or delete your account at any time in Settings.</li>
        </ul>

        <h2>Your photos, and what you let us do with them</h2>
        <ul>
          <li><strong>Your photos stay yours.</strong> You keep all the rights you have in them.</li>
          <li>When you add a photo (or a comment) to an album, you give HexArch Limited permission to store it, make smaller copies of it, check it automatically, and show it to the people in that album (and, for a public event or one shared with a group, to the people it&apos;s shared with), only to run Momento. This permission ends when it&apos;s deleted, except for copies in backups, which are gone within 12 months.</li>
          <li>Camera RAW files are kept as full-size, high-quality JPEGs; other photos are kept as you uploaded them, without their location data.</li>
          <li>Everyone in an album can see and download its photos. Only add photos you&apos;re happy for them to have.</li>
          <li><strong>You confirm that you took each photo or have permission to share it</strong>, and that sharing it doesn&apos;t break anyone&apos;s copyright or privacy. Ask before adding photos of people who wouldn&apos;t want them shared.</li>
          <li>In a photo competition, only the top 10 entries are kept when it ends; every other entry is deleted.</li>
        </ul>

        <h2>What isn&apos;t allowed</h2>
        <p>Don&apos;t use Momento to upload, share or comment:</p>
        <ul>
          <li><strong>intimate images of anyone without their consent</strong>, including images that show them nude, partly nude or in a sexual or private act, or that were taken somewhere they&apos;d expect privacy</li>
          <li>nudity or sexual content (Momento&apos;s content levels 85 to 100), and never any sexual content involving anyone under 18</li>
          <li>content that is violent, hateful, harassing, bullying, threatening or defamatory</li>
          <li>photos you don&apos;t have the right to share, including other people&apos;s copyrighted work</li>
          <li>private information about someone without their permission</li>
          <li>anything illegal, or spam, malware, or attempts to break, overload or get around Momento&apos;s security</li>
        </ul>

        <h2>How we check content</h2>
        <p>These rules are how Momento meets its duties under Australia&apos;s <em>Online Safety Act 2021</em> (Cth). Every uploaded photo is checked automatically (by Amazon Rekognition) and given a content level from 0 to 100:</p>
        <ul>
          <li><strong>0 to 75</strong> (everyday photos to clearly suggestive, still covered): shown in the album.</li>
          <li><strong>85 and 95</strong> (near-nude, or nude with key areas hidden): kept private; you can ask a person to review it.</li>
          <li><strong>100</strong> (nudity or sexual activity): kept private and never published.</li>
        </ul>
        <p>Automatic checks can get it wrong in both directions, which is why a person can review a decision and why you can report a photo.</p>

        <h2>Reporting a photo, and takedowns</h2>
        <p>If you see a photo or comment that breaks these terms, or a photo of you that you didn&apos;t agree to, open it and choose <strong>Report</strong>, or email <a href="mailto:team@hexarch.org?subject=Report">team@hexarch.org</a>. You won&apos;t see a photo you reported again, and a photo reported by three people is hidden from everyone until our team decides. We act on reports as quickly as we can, and on any removal notice from the eSafety Commissioner within 24 hours. You can also report serious online harm to the eSafety Commissioner at <a href="https://www.esafety.gov.au" rel="noopener">esafety.gov.au</a>.</p>

        <h2>Copyright complaints</h2>
        <p>If you believe a photo on Momento infringes your copyright, email <a href="mailto:team@hexarch.org?subject=Copyright%20complaint">team@hexarch.org</a> with the subject “Copyright complaint”, and include:</p>
        <ol>
          <li>your name, address, phone number and email;</li>
          <li>the work you own, and where the photo is on Momento (the link, or the album code and a description of the photo);</li>
          <li>a statement that you believe in good faith the use isn&apos;t authorised by you, your agent or the law;</li>
          <li>a statement that the information in your notice is accurate and that you are the owner, or authorised to act for the owner; and</li>
          <li>your physical or electronic signature.</li>
        </ol>
        <p>We&apos;ll remove or disable the photo and tell the person who added it. If they believe it was removed by mistake, they can reply to the same address with their contact details, the photo and why it was a mistake. We may then restore it, unless the person who complained tells us they&apos;ve started legal action.</p>
        <p><strong>Repeat infringers:</strong> an account that receives three valid copyright complaints is suspended, and a photo taken down for copyright can&apos;t be uploaded again.</p>

        <h2>Removing content and suspending accounts</h2>
        <p>We may remove photos or comments, or suspend or close accounts, that break these terms or the law, or that put other people or Momento at risk. Where we can, we&apos;ll tell you why. A suspended account can still download its data or be deleted. You can stop using Momento and delete your account whenever you like.</p>

        <h2>Your consumer rights</h2>
        <p>Our services come with guarantees that can&apos;t be excluded under the Australian Consumer Law (Schedule 2 of the <em>Competition and Consumer Act 2010</em> (Cth)), and consumers elsewhere may have similar rights. Nothing in these terms excludes, restricts or changes those rights.</p>

        <h2>Disclaimers</h2>
        <p>Subject to your consumer rights, Momento is provided “as is” and “as available”. We work hard to keep it running and your photos safe, and we keep daily backups, but we can&apos;t promise it will always be available or free of errors, so keep your own copies of photos that matter to you (any album can be downloaded as a .zip).</p>

        <h2>Limitation of liability</h2>
        <p>To the extent the law allows, HexArch Limited isn&apos;t liable for indirect or consequential losses, or for content other people upload. Where the Australian Consumer Law lets us limit our liability for failing to meet a consumer guarantee, our liability is limited to supplying the service again or paying the cost of having it supplied again. Nothing in these terms limits any liability that can&apos;t be limited by law.</p>

        <h2>Changes to these terms</h2>
        <p>If we change these terms, we&apos;ll update the date at the top and, for important changes, tell you in Momento or by email before they apply. If you keep using Momento after that, the new terms apply.</p>

        <h2>Governing law</h2>
        <p>These terms are governed by the laws of Victoria, Australia, and the courts of Victoria (and courts able to hear appeals from them) have jurisdiction. If you live outside Australia, this doesn&apos;t take away any protection you have under the law of the place where you live.</p>

        <h2>Accessibility</h2>
        <p>We want everyone to be able to use Momento, and we aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. Momento works with a keyboard and screen readers, supports reduced motion and light and dark themes, and is checked with automated accessibility tests. If anything is hard to use, or you need something in another format, email <a href="mailto:team@hexarch.org?subject=Accessibility">team@hexarch.org</a> with the subject “Accessibility”. We&apos;ll reply within 5 working days.</p>

        <h2>Contact</h2>
        <p>HexArch Limited, Victoria, Australia, <a href="mailto:team@hexarch.org">team@hexarch.org</a>, or use the <a href="support">support page</a>.</p>

        <h2>Credits</h2>
        <p>On devices without flag emoji (such as Windows), country flags are drawn with <a href="https://github.com/twitter/twemoji" rel="noopener">Twemoji</a> by Twitter, used under the <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a> licence, through the country-flag-emoji-polyfill font by TalkJS (MIT licence).</p>
      </main>

      <footer>© 2026 HexArch Limited · <a href="/">Momento</a> · <a href="privacy">Privacy</a> · <a href="albums">My albums</a> · <a href="events">Events near you</a> · <a href="support">Support</a></footer>
    </>
  );
}
