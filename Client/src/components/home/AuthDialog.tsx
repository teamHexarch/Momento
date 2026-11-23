'use client';

import { useEffect } from 'react';
import { setUpAuth } from './authLogic';

/** Sign up / log in (window.openAuth), the new-device step, and the popups for links from emails (see authLogic.ts) */
export default function AuthDialog() {
  useEffect(() => setUpAuth(), []);
  return (
    <>
      <dialog className="auth-dialog" id="authDialog" aria-labelledby="authTitle">
        <form className="auth-card" id="authForm" data-mode="signup" noValidate>
          <button className="auth-close" type="button" aria-label="Close" data-close="">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <div className="auth-body">
            <div className="auth-scan" id="authScan" hidden><i><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></i>You scanned Amira &amp; Joel’s wedding</div>
            <h2 id="authTitle">Create your account</h2>
            <p className="auth-sub" id="authSub">Keep every album you join, and add your photos in one tap.</p>
            <div className="auth-tabs" role="tablist" aria-label="Sign up or log in">
              <span className="auth-tab-pill" aria-hidden="true"></span>
              <button type="button" role="tab" data-mode="signup" aria-selected="true">Sign up</button>
              <button type="button" role="tab" data-mode="login" aria-selected="false">Log in</button>
            </div>
            <div className="auth-social">
              <button className="auth-alt" type="button" data-provider="Google"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4A6CB5" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" /><path fill="#4E8C64" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" /><path fill="#C9A23B" d="M6.4 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z" /><path fill="#B5523F" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6Z" /></svg>Continue with Google</button>
            </div>
            <div className="auth-or">or use your email</div>
            <label className="auth-field" data-only="signup"><span>Your name</span><input name="name" autoComplete="name" /></label>
            <label className="auth-field"><span>Email</span><input name="email" type="email" autoComplete="email" inputMode="email" /></label>
            <label className="auth-field"><span>Password</span><input name="password" type="password" autoComplete="new-password" /></label>
            <a className="auth-forgot" data-only="login" href="#">Forgot your password?</a>
            <label className="auth-consent" data-only="signup"><input type="checkbox" name="acceptTerms" /><span>I’m 13 or older and agree to Momento’s <a href="terms" target="_blank" rel="noopener">Terms</a> and <a href="privacy" target="_blank" rel="noopener">Privacy Policy</a></span></label>
            <div data-only="signup"><div id="signupCaptcha"></div><p id="captchaStatus" role="status"></p></div>
            <p className="auth-error" id="authError" role="alert"></p>
            <button className="btn btn-dark auth-submit" type="submit" id="authSubmit">Create account</button>
            <button className="auth-skip" type="button" id="authSkip" hidden>Just look at the album for now</button>
            <p className="auth-note">Your account keeps your albums together. Please verify your email after signing up.</p>
          </div>
          <section id="deviceStep" hidden>
            <h2 id="deviceTitle">Three devices are logged in</h2>
            <p className="auth-sub" id="deviceHelp"></p>
            <label className="auth-field" id="deviceCodeField" hidden><span>Email verification code</span><input id="deviceCode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} /></label>
            <div id="deviceChoices"></div>
            <p className="auth-error" id="deviceError" role="alert"></p>
            <button className="auth-alt auth-submit" type="button" id="deviceAction"></button>
            <button className="auth-skip" type="button" id="deviceResend" hidden>Send a new code</button>
          </section>
          <div className="auth-done" id="authDone" hidden role="status">
            <i><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></i>
            <b id="authDoneTitle">You’re in</b>
            <span id="authDoneSub"></span>
          </div>
        </form>
      </dialog>
    </>
  );
}
