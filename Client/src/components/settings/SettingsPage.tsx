import type { CSSProperties } from 'react';
import SiteFooter from '@/components/shared/SiteFooter';

export default function SettingsPage() {
  return (
    <>
      <div className="page-wrap" id="pageWrap">
        <div className="trail" id="trail" data-trail="" data-pad="10" data-avoid=".s-head > *, .s-group, .site-foot" aria-hidden="true"></div>
        <main className="page">

          <section className="s-head">
            <span className="mask"><h1 className="s-title ink rise" data-text="Settings">Settings</h1></span>
            <p className="s-lede intro" style={{ '--d': '.3s' } as CSSProperties}>Everything saves by itself as you change it.</p>
          </section>

          <div className="s-cols">
            <div className="s-stack">

              {/* Your details: each line shows what it's set to; Change opens the form under it */}
              <section className="s-group" style={{ '--d': '.22s' } as CSSProperties} aria-labelledby="g-you">
                <h2 id="g-you">Your details</h2>
                <div className="s-list panel">
                  <div className="s-item">
                    <div className="s-line">
                      <span className="s-avatar" id="avatarNow" aria-hidden="true"></span>
                      <span className="s-text"><b>Profile photo</b><small id="avatarHint">Shown beside your name in groups and albums</small></span>
                      <span className="s-photo-acts">
                        <button className="s-change" type="button" id="avatarPick">Add photo</button>
                        <button className="s-change is-danger" type="button" id="avatarRemove" hidden>Remove</button>
                      </span>
                    </div>
                    <input type="file" id="avatarFile" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*" hidden />
                  </div>
                  <div className="s-item">
                    <div className="s-line"><span className="s-text"><b>Name</b><small id="nameNow">…</small></span><button className="s-change" type="button" aria-expanded="false" aria-controls="namePanel">Change</button></div>
                    <div className="s-panel" id="namePanel" hidden>
                      <form className="s-profile" id="profileForm" noValidate>
                        <label className="acct-field"><span>Your name</span><input name="name" autoComplete="name" placeholder="For example Priya Shah" /></label>
                        <p className="s-note" id="profileNote" role="status"></p>
                        <div className="s-form-acts"><button className="btn btn-dark btn-sm" type="submit">Save name</button><button className="s-cancel" type="button" data-cancel="">Cancel</button></div>
                      </form>
                    </div>
                  </div>
                  <div className="s-item">
                    <div className="s-line"><span className="s-text"><b>Email</b><small><span id="emailNow">…</span><span id="emailVia"></span></small></span><button className="s-change" type="button" aria-expanded="false" aria-controls="emailPanel">Change</button></div>
                    <div className="s-panel" id="emailPanel" hidden>
                      <form className="s-profile" id="emailForm" noValidate>
                        <label className="acct-field"><span>New email</span><input name="email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" /></label>
                        <label className="acct-field" id="emailPassField"><span>Your password</span><input name="password" type="password" autoComplete="current-password" /></label>
                        <p className="s-help">We’ll email your current address first so you can approve the change, then you confirm it from the new one.</p>
                        <p className="s-note" id="emailNote" role="status"></p>
                        <div className="s-form-acts"><button className="btn btn-dark btn-sm" type="submit">Change email</button><button className="s-cancel" type="button" data-cancel="">Cancel</button></div>
                      </form>
                    </div>
                  </div>
                  <div className="s-item" id="passwordGroup" hidden>
                    <div className="s-line"><span className="s-text"><b>Password</b><small>••••••••</small></span><button className="s-change" type="button" aria-expanded="false" aria-controls="passwordPanel">Change</button></div>
                    <div className="s-panel" id="passwordPanel" hidden>
                      <div id="passwordVerify" hidden>
                        <p className="s-help">Confirm your email before changing your password. Open the link we sent to <b data-verify-email=""></b>.</p>
                        <p className="s-note" id="passwordVerifyNote" role="status"></p>
                        <div className="s-form-acts"><button className="btn btn-dark btn-sm" type="button" id="passwordVerifySend">Send the link again</button></div>
                      </div>
                      <form className="s-profile" id="passwordForm" noValidate>
                        <p className="s-help">First enter your current password. We’ll email you a 6-digit code to make sure it’s you.</p>
                        <label className="acct-field"><span>Current password</span><input name="current" type="password" autoComplete="current-password" /></label>
                        <p className="s-note" id="passwordNote" role="status"></p>
                        <div className="s-form-acts"><button className="btn btn-dark btn-sm" type="submit">Send code</button><button className="s-cancel" type="button" data-cancel="">Cancel</button></div>
                      </form>
                      <form className="s-profile" id="passwordCodeForm" noValidate hidden>
                        <p className="s-help">We sent a 6-digit code to <b data-code-to=""></b>. Enter it below; it works for 10 minutes.</p>
                        <label className="acct-field"><span>6-digit code</span><input className="s-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" spellCheck="false" /></label>
                        <p className="s-note" id="passwordCodeNote" role="status"></p>
                        <div className="s-form-acts"><button className="btn btn-dark btn-sm" type="submit">Continue</button><button className="s-cancel" type="button" data-new-code="">Send a new code</button><button className="s-cancel" type="button" data-cancel="">Cancel</button></div>
                      </form>
                    </div>
                  </div>
                  {/* A copy of everything the account holds, as one file (GET /api/auth/me/export) */}
                  <div className="s-item">
                    <div className="s-line">
                      <span className="s-text"><b>Your data</b><small id="exportHint">A file with your profile, albums, photo list and choices</small></span>
                      <button className="s-change" type="button" id="exportData">Download my data</button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Step 3 of changing the password: opens once the emailed code is right */}
              <dialog className="acct-dialog" id="newPassDialog" aria-labelledby="newPassTitle">
                <form className="acct-card" id="newPassForm" noValidate>
                  <button className="acct-x" type="button" aria-label="Close" data-np-close=""><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                  <h2 id="newPassTitle">Choose a new password</h2>
                  <p className="acct-sub">At least 8 characters, and different from your current password.</p>
                  <label className="acct-field"><span>New password</span><input name="next" type="password" autoComplete="new-password" /></label>
                  <label className="acct-field"><span>New password again</span><input name="again" type="password" autoComplete="new-password" /></label>
                  <p className="acct-status" role="status"></p>
                  <div className="acct-actions"><button className="acct-ghost" type="button" data-np-close="">Cancel</button><button className="acct-primary" type="submit">Change password</button></div>
                </form>
              </dialog>

              {/* Notifications: real switches for this device */}
              <section className="s-group" style={{ '--d': '.26s' } as CSSProperties} aria-labelledby="g-notify">
                <h2 id="g-notify">Notifications</h2>
                <div className="s-list panel">
                  <div className="s-row" data-row=""><span className="s-text"><b>Public events near me</b><small>Tells me when I’m inside a public event’s zone. Needs location</small></span><button className="s-sw" type="button" role="switch" aria-checked="true" aria-label="Public events near me" data-key="nearby"></button><span className="s-state" aria-hidden="true"></span></div>
                  <div className="s-row" data-row=""><span className="s-text"><b>Activity on my public albums</b><small>A small dot when someone joins or adds photos. Never a pop-up</small></span><button className="s-sw" type="button" role="switch" aria-checked="true" aria-label="Activity on my public albums" data-key="notify.activity"></button><span className="s-state" aria-hidden="true"></span></div>
                </div>
                <p className="s-help">Event alerts are saved on this device. Activity follows your account.</p>
              </section>

              {/* Permissions: what this browser lets Momento use, straight from the browser */}
              <section className="s-group" style={{ '--d': '.3s' } as CSSProperties} aria-labelledby="g-perms">
                <h2 id="g-perms">Permissions on this device</h2>
                <div className="s-list panel">
                  <div className="s-line" data-perm="camera">
                    <span className="s-perm-ic" aria-hidden="true" data-perm-ic=""></span>
                    <span className="s-text"><b>Camera</b><small className="s-perm-sub"><span className="s-perm-what">Taking photos and scanning QR codes</span><span className="s-perm-state" data-state="prompt">Checking…</span></small></span>
                    <button className="s-change" type="button" data-perm-btn="" hidden>Allow</button>
                  </div>
                  <div className="s-line" data-perm="location">
                    <span className="s-perm-ic" aria-hidden="true" data-perm-ic=""></span>
                    <span className="s-text"><b>Location</b><small className="s-perm-sub"><span className="s-perm-what">Checking you’re at the event, finding events nearby</span><span className="s-perm-state" data-state="prompt">Checking…</span></small></span>
                    <button className="s-change" type="button" data-perm-btn="" hidden>Allow</button>
                  </div>
                  <div className="s-line" data-perm="notifications">
                    <span className="s-perm-ic" aria-hidden="true" data-perm-ic=""></span>
                    <span className="s-text"><b>Notifications</b><small className="s-perm-sub"><span className="s-perm-what">Alerts for public events near you</span><span className="s-perm-state" data-state="prompt">Checking…</span></small></span>
                    <button className="s-change" type="button" data-perm-btn="" hidden>Allow</button>
                  </div>
                </div>
                <p className="s-help">Momento only asks when a feature needs it. To turn one off again, use your browser’s or phone’s site settings.</p>
              </section>

              <section className="s-group" style={{ '--d': '.38s' } as CSSProperties} aria-labelledby="g-look">
                <h2 id="g-look">Light or dark</h2>
                <div className="s-list panel s-seg">
                  <div className="acct-seg" id="appSeg" role="radiogroup" aria-label="Light or dark">
                    <span className="acct-seg-pill" aria-hidden="true"></span>
                    <button type="button" role="radio" aria-checked="false" data-theme="light"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.6" /><g className="rays"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></g></svg>Light</button>
                    <button type="button" role="radio" aria-checked="false" data-theme="dark"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="moon" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg>Dark</button>
                    <button type="button" role="radio" aria-checked="false" data-theme="system"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12" rx="2.2" /><path d="M8.5 20h7M12 16.5V20" /><circle className="scr-dot" cx="12" cy="10.5" r="1.8" fill="currentColor" stroke="none" /></svg>System</button>
                  </div>
                  <p className="s-help s-seg-help">System follows your device’s own setting.</p>
                </div>
              </section>

              {/* Language: menus, buttons and settings (assets/i18n.js). Picking one reloads the page in it */}
              <section className="s-group" style={{ '--d': '.4s' } as CSSProperties} aria-labelledby="g-lang">
                <h2 id="g-lang">Language</h2>
                <div className="s-list panel">
                  <div className="s-line s-lang-line">
                    <span className="s-text"><b id="langLabel">Language</b><small>Every page, menu and message, in the language you choose.</small></span>
                    <button className="s-change s-lang-btn" type="button" id="langBtn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="langLabel langBtnText"><span id="langBtnText" data-no-i18n=""></span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
                  </div>
                </div>






































































              </section>

              <section className="s-group" style={{ '--d': '.42s' } as CSSProperties} aria-labelledby="g-store" id="storeGroup">
                <h2 id="g-store">Space on this device</h2>
                <div className="s-list panel">
                  <div className="s-store" id="store">
                    <div className="s-store-top"><span className="s-text"><b id="storeTotal">Checking…</b><small id="storeFree" className="s-free"></small></span><button className="btn btn-light btn-sm" type="button" id="clearCache">Free up space</button></div>
                    <div className="s-bar" id="storeBar" role="img" aria-label="How Momento’s space on this device is used"></div>
                    <div className="s-parts" id="storeParts"></div>
                    <div className="s-row" data-row="" id="keepRow"><span className="s-text"><b>Keep Momento’s data on this device</b><small>Stops the browser clearing it by itself when the device runs low on space</small></span><button className="s-sw" type="button" role="switch" aria-checked="false" aria-label="Keep Momento’s data on this device" id="keepSw"></button><span className="s-state" aria-hidden="true"></span></div>
                  </div>
                </div>
              </section>

              {/* Leaving: a plain, big Log out; deleting the account is kept small and asks twice */}
              <section className="s-group s-leave" style={{ '--d': '.46s' } as CSSProperties} aria-label="Log out or delete account">
                <button className="btn btn-light s-logout" type="button" id="logOut">Log out</button>
                <button className="s-delete-btn" type="button" id="deleteAcct">Delete my account</button>
                <div className="s-delete panel" id="deleteConfirm" hidden>
                  <p className="s-help">This removes your albums and photos for good.</p>
                  <label className="acct-field"><span>Your password, to confirm</span><input type="password" id="deletePass" autoComplete="current-password" /></label>
                  <p className="s-note" id="deleteNote" role="status"></p>
                </div>
              </section>

            </div>
          </div>

          <SiteFooter />
        </main>
      </div>
    </>
  );
}
