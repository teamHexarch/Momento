export default function PrivacyBody() {
  return (
    <>
      <header className="top">
        <a className="brand" href="/"><img src="assets/momento-icon.png" alt="" />Momento</a>
        <a className="back" href="/">Back to Momento</a>
      </header>

      <main>
        <h1>Privacy policy</h1>
        <p className="updated">Last updated 28 November 2026</p>
        {/* LEGAL REVIEW: this policy was rewritten for Australian law on 26 November 2026 (age check, photo details,
            evidence kept for the police and breach handling updated 28 November) and has not yet been checked by a
            lawyer. Remove the draft note below once it has been reviewed and approved. */}
        <p className="draft-note" role="note"><strong>Draft:</strong> this updated policy is waiting for a legal review and may still change.</p>

        <p className="lede">Momento (momento.hexarch.org) is a shared photo album for events, run by HexArch Limited in Victoria, Australia. This policy explains what personal information we collect, why, where it&apos;s kept, who we share it with and how to see, correct or delete it. It&apos;s written to meet the Australian Privacy Principles in the <em>Privacy Act 1988</em> (Cth), and the same rights apply wherever you live. We don&apos;t sell your information, we don&apos;t show ads, and we don&apos;t use your photos for anything except running Momento for the people in your album.</p>

        <h2>What we collect, and why</h2>
        <p>We only collect what Momento needs to work, and we collect it from you (or from Google, if you sign in with Google).</p>
        <table>
          <thead><tr><th>What</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td>Your name and email</td><td>To create your account, show album members who added each photo or comment, and send you account emails.</td></tr>
            <tr><td>Your password</td><td>Stored only as a one-way scrambled hash; nobody at Momento can see it.</td></tr>
            <tr><td>Google account details</td><td>If you use “Continue with Google”: your name, email, profile picture and Google account ID, so you can sign in. We never get your Google password.</td></tr>
            <tr><td>Your date of birth</td><td>Checked at sign-up (with your email or Google) so that nobody under 13 creates an account. We keep only the result (whether you&apos;re under 18) and when it was checked, never the date itself. If you&apos;re 13 to 17, we also record when you confirmed that a parent or guardian agrees.</td></tr>
            <tr><td>Photos you upload</td><td>To share them with the people in that album. Before storing a photo we remove where it was taken (GPS) and the hidden details that identify a person or camera (in its EXIF, XMP and IPTC data: owner and author names, copyright and contact notes, serial numbers, and face or person tags). We keep the camera make and model and the date it was taken, so albums can be sorted by it. Camera RAW files are kept as full-size JPEGs.</td></tr>
            <tr><td>Comments, reactions and bookmarks</td><td>To show your comments and reactions to the people in the album; bookmarks are only visible to you.</td></tr>
            <tr><td>Event games</td><td>Your poll votes, quiz answers, game points and any photos you enter in a photo competition, to run the games and their leaderboard for that event.</td></tr>
            <tr><td>Albums you create</td><td>The album&apos;s name, date and times, the venue you choose on the map and its sharing zone, so guests can join and add photos.</td></tr>
            <tr><td>Your location, only if the host turns on the venue check, or when you look for events nearby</td><td>Your browser asks before sharing it. We use it only to check you&apos;re near the venue, or to find public events around you, and we don&apos;t store it. Most events don&apos;t ask for it at all.</td></tr>
            <tr><td>Camera</td><td>Used only while you take a photo or scan a QR code in Momento.</td></tr>
            <tr><td>Logged-in devices</td><td>For each device: a name such as “iPhone • Safari”, the start of its IP address (for example 203.0.113.x), and when it was last active. So you can see your devices in Settings and sign them out, and so we can keep your account secure.</td></tr>
            <tr><td>Reviews and messages to support</td><td>What you send us, so we can reply and improve Momento.</td></tr>
          </tbody>
        </table>
        <p>If you don&apos;t give us the information marked as needed (such as your email), you can still look at a public album but you can&apos;t create an account or add photos.</p>

        <h2>Who can see your photos</h2>
        <p>Only people who have joined the album (with its code, link or QR code), or the friend group it&apos;s shared with, can see and download its photos and comments. A public event can also be found on the Events map by people near the venue. Anyone you give an album code to can join, so share it with care. The host can remove any photo or comment in their album, and you can remove your own.</p>

        <h2>Automatic photo checks and staff review</h2>
        <p>To keep nudity and illegal content off Momento, every uploaded photo is checked automatically by Amazon Rekognition, a service of Amazon Web Services. It gives the photo a content level; photos at the higher levels are kept private and are never shown to the album, and you can ask a person to review the decision. A small Momento staff team (at most six people, each with their own access) can see photos that are waiting for review or have been reported. Their decisions are recorded so we can check how the automatic check is working, and they help it improve. For photo competitions, Rekognition also describes entries (for example the objects and smiling faces in them) to suggest a shortlist to the host.</p>

        <h2>Cookies and storage in your browser</h2>
        <ul>
          <li><strong>A login cookie</strong>, so you stay signed in. It can&apos;t be read by the page&apos;s scripts and is only sent to Momento.</li>
          <li><strong>Small settings</strong> saved in your browser, such as light or dark mode and your language.</li>
        </ul>
        <p>We don&apos;t use advertising or tracking cookies.</p>

        <h2>Where your information is kept, and who we share it with</h2>
        <p>We share your information only with the service providers that run Momento for us, who may use it only to provide their service:</p>
        <ul>
          <li><strong>Amazon Web Services</strong>, in its Sydney (Australia) region: Momento&apos;s server, photo storage (Amazon S3), automatic photo checks (Amazon Rekognition) and emails (Amazon SES).</li>
          <li><strong>MongoDB Atlas</strong>: stores accounts, albums, comments and photo details (not the photo files).</li>
          <li><strong>Google</strong>: “Continue with Google” sign-in, the reCAPTCHA check on sign-up, and the map for choosing a venue.</li>
          <li><strong>GitHub</strong>: delivers the website&apos;s pages.</li>
        </ul>
        <p><strong>Overseas disclosure:</strong> photos and most information are stored in Australia, but some of these providers (including Google, GitHub and MongoDB) may store or handle information in other countries, such as the United States. We choose providers that protect information to standards comparable to the Australian Privacy Principles. We may also disclose information when the law requires it (for example a valid request from an Australian authority such as the eSafety Commissioner or the police).</p>
        <p><strong>Child safety:</strong> if we find child sexual abuse material, Australian law requires us to report it. We keep a secure copy as evidence (no one at Momento can view it through the app), remove it everywhere, suspend the account that added it and report it to the Australian Centre to Counter Child Exploitation (Australian Federal Police), including the account&apos;s details. That evidence is kept, separately from everything else, until the police tell us it&apos;s no longer needed.</p>

        <h2>Emails</h2>
        <p>We send account emails (confirming your address, resetting your password, security alerts such as a new device signing in) and album emails (invites, reminders, photo review results). You can turn album notifications off in Settings, and every email that isn&apos;t about your account has a one-click unsubscribe link. We don&apos;t send marketing emails.</p>

        <h2>How long we keep things</h2>
        <ul>
          <li>Your account stays until you delete it. Sign-ups never confirmed are deleted after 7 days.</li>
          <li>Albums and their photos stay until the host deletes the album or their account. After an event, albums stop taking new photos but stay available to view and download.</li>
          <li>Photos you delete stay in the host&apos;s “Recently deleted” bin for 30 days, then are removed. Photos kept private by the automatic check are deleted after 30 days unless you ask for a review.</li>
          <li>Photo competition entries: when a competition ends only the top 10 are kept with the event; every other entry is deleted straight away.</li>
          <li>Records of automatic photo decisions are kept for a year; security and staff action logs for two years.</li>
          <li>Backups: a daily backup is kept for 14 days and a monthly one for about 13 months, in separate locked storage that can&apos;t be changed or deleted early, so deleted information is gone from every backup within 14 months.</li>
          <li>Evidence kept for the police (see Child safety above) stays until the police no longer need it.</li>
        </ul>

        <h2>Keeping your information secure</h2>
        <p>Photos are stored privately and only shown through short-lived links to people allowed to see them. Information is encrypted in transit and at rest, passwords are hashed, logins are limited to a few devices and can be signed out remotely, and staff access needs a personal code and is logged.</p>
        <p><strong>Data breaches:</strong> we have a written plan for data breaches. If we suspect one, we contain it at once and assess it within 30 days (usually far sooner). If it&apos;s likely to cause serious harm to anyone, we&apos;ll notify the people affected and the Office of the Australian Information Commissioner (OAIC) as the Notifiable Data Breaches scheme (Part IIIC of the Privacy Act) requires, and, for people in the European Union or the United Kingdom, the relevant regulator within 72 hours where their law requires it. We&apos;ll tell you what happened, what we&apos;re doing about it and what you can do.</p>

        <h2>Seeing, correcting and deleting your information</h2>
        <ul>
          <li><strong>See and download:</strong> Settings → Download my data gives you a copy of your information, and any album can be downloaded as a .zip.</li>
          <li><strong>Correct:</strong> change your name and email in Settings, or ask us to correct anything else.</li>
          <li><strong>Delete:</strong> delete any photo or comment you added, or your whole account in Settings. Deleting your account permanently removes it, the albums you host (with all their photos) and the photos and comments you added elsewhere. This can&apos;t be undone, so download anything you want to keep first.</li>
          <li>You can also ask us by email at <a href="mailto:team@hexarch.org?subject=Privacy">team@hexarch.org</a>. We reply within 30 days and don&apos;t charge for it.</li>
        </ul>
        <p>If you&apos;re in the European Union or the United Kingdom, you also have the right to object to or restrict how we use your information and to move it elsewhere; ask us at the same address.</p>

        <h2>Complaints</h2>
        <p>If you&apos;re worried about how we&apos;ve handled your information, email <a href="mailto:team@hexarch.org?subject=Privacy%20complaint">team@hexarch.org</a> with the subject “Privacy complaint” and we&apos;ll reply within 30 days. If you&apos;re not happy with our answer, you can complain to the OAIC at <a href="https://www.oaic.gov.au" rel="noopener">oaic.gov.au</a>, or to the privacy regulator where you live.</p>

        <h2>Children</h2>
        <p>Momento isn&apos;t for children under 13, and they can&apos;t create an account: sign-up asks for a date of birth and turns away anyone under 13. People aged 13 to 17 need a parent or guardian&apos;s agreement. If we learn an account belongs to someone under 13, we delete it. A parent or guardian can ask us to see or delete a teenager&apos;s information at <a href="mailto:team@hexarch.org?subject=Privacy">team@hexarch.org</a>.</p>

        <h2>Changes</h2>
        <p>If we change this policy, we&apos;ll update this page and the date at the top. For bigger changes we&apos;ll let account holders know by email before they apply.</p>

        <h2>Contact</h2>
        <p>HexArch Limited, Victoria, Australia. Privacy questions: <a href="mailto:team@hexarch.org?subject=Privacy">team@hexarch.org</a>, or use the <a href="support">support page</a>.</p>
      </main>

      <footer>© 2026 HexArch Limited · <a href="/">Momento</a> · <a href="terms">Terms</a> · <a href="albums">My albums</a> · <a href="events">Events near you</a> · <a href="support">Support</a></footer>
    </>
  );
}
