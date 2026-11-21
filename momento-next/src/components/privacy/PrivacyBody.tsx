export default function PrivacyBody() {
  return (
    <>
      <header className="top">
        <a className="brand" href="index.html"><img src="assets/momento-icon.png" alt="" />Momento</a>
        <a className="back" href="index.html">Back to Momento</a>
      </header>

      <main>
        <h1>Privacy policy</h1>
        <p className="updated">Last updated 7 November 2026</p>

        <p className="lede">Momento (hexarch.org) is a shared photo album for events, run by HexArch Limited. This page explains what we collect, why, where it's kept and how to have it deleted. We don't sell your information, we don't show ads, and we don't use your photos for anything except showing them to the people in your album.</p>

        <h2>What we collect</h2>
        <table>
          <thead><tr><th>What</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td>Your name and email</td><td>To create your account, show other album members who added each photo, and send you account emails.</td></tr>
            <tr><td>Your password</td><td>Stored only as a one-way scrambled hash; we can never see it.</td></tr>
            <tr><td>Google account details</td><td>If you use “Continue with Google”: your name, email, profile picture and Google account ID, so you can sign in. We don't get your Google password or anything else in your Google account.</td></tr>
            <tr><td>Photos you upload</td><td>To share them with the people in that album. Before storing a photo we remove its hidden details (EXIF, XMP and IPTC), including any GPS location.</td></tr>
            <tr><td>Albums you create</td><td>The album's name, date and times, the venue you choose on the map and its sharing zone, so guests can join and add photos at the event.</td></tr>
            <tr><td>Your location, when uploading</td><td>For albums with a sharing zone, your browser asks before sharing your location with us, and we use it only to check you're near the venue. We don't store it.</td></tr>
            <tr><td>Camera</td><td>Used only while you take a photo or scan a QR code in Momento. Photos taken in Momento go straight to the album; nothing is recorded or kept otherwise.</td></tr>
            <tr><td>Login records</td><td>When you last logged in and which devices are logged in, so you can stay signed in and we can sign out old devices.</td></tr>
            <tr><td>Messages to support</td><td>What you send through the support form, so we can reply.</td></tr>
          </tbody>
        </table>

        <h2>Who can see your photos</h2>
        <p>Only people who have joined the album (with its code or QR code) can see and download its photos. Anyone you give the code to can join, so share it with care. The album's host can remove any photo in their album, and you can remove the photos you added.</p>

        <h2>Cookies and storage in your browser</h2>
        <ul>
          <li><strong>A login cookie</strong>, so you stay signed in. It can't be read by the page's scripts and is only sent to Momento.</li>
          <li><strong>Small settings</strong> saved in your browser, such as light or dark mode.</li>
        </ul>
        <p>We don't use advertising or tracking cookies.</p>

        <h2>Services we use</h2>
        <p>To run Momento we rely on these providers, who handle data only to provide their service to us:</p>
        <ul>
          <li><strong>Amazon Web Services</strong> (Sydney, Australia): runs Momento's server, stores the photos and sends our emails.</li>
          <li><strong>MongoDB Atlas</strong>: stores accounts, albums and photo details (not the photo files).</li>
          <li><strong>Google</strong>: “Continue with Google” sign-in, the reCAPTCHA “I'm not a robot” check on sign-up, and the map for choosing a venue. Google's <a href="https://policies.google.com/privacy" rel="noopener">Privacy Policy</a> and <a href="https://policies.google.com/terms" rel="noopener">Terms of Service</a> apply to those.</li>
          <li><strong>GitHub Pages</strong>: delivers the website's pages.</li>
        </ul>

        <h2>Emails</h2>
        <p>We send account emails (confirming your address, resetting your password, changing your email) and album emails a host triggers (invites and reminders). You can choose which album notifications you get in Settings. We don't send marketing emails.</p>

        <h2>How long we keep things</h2>
        <ul>
          <li>Your account and its details stay until you delete it.</li>
          <li>Albums and their photos stay until the host deletes the album or their account. After an event, albums stop taking new photos but stay available to view and download.</li>
          <li>One-time links in emails (confirm, reset) stop working after use or after they expire.</li>
        </ul>

        <h2>Deleting your account</h2>
        <p>You can delete your account in Settings. That permanently removes your account, the albums you host (with all their photos) and the photos you added to other albums. This can't be undone, so download anything you want to keep first.</p>

        <h2>Your choices and rights</h2>
        <p>You can see and change your name and email in Settings, and download a copy of your information there (Download my data). You can also ask us for a copy of your information, a correction, or its deletion, by emailing <a href="mailto:team@hexarch.org">team@hexarch.org</a>. We'll reply as soon as we can.</p>

        <h2>Children</h2>
        <p>Momento isn't meant for children under 13, and they shouldn't create an account.</p>

        <h2>Changes</h2>
        <p>If we change this policy, we'll update this page and the date at the top. For bigger changes we'll let account holders know by email.</p>

        <h2>Contact</h2>
        <p>HexArch Limited, <a href="mailto:team@hexarch.org">team@hexarch.org</a>, or use the <a href="support.html">support page</a>.</p>
      </main>

      <footer>© 2026 HexArch Limited · <a href="index.html">Momento</a> · <a href="terms.html">Terms</a> · <a href="albums.html">My albums</a> · <a href="events.html">Events near you</a> · <a href="support.html">Support</a></footer>
    </>
  );
}
