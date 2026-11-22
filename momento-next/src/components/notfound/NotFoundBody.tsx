export default function NotFoundBody() {
  return (
    <>
      <header className="top">
        <a className="brand" href="/index.html"><img src="/assets/momento-icon.png" alt="" />Momento</a>
      </header>

      <main>
        <h1>This page doesn’t exist</h1>
        <p>The link may be mistyped or out of date. If someone sent you an album, ask them for its code or QR code again.</p>
        <div className="acts">
          <a className="btn btn-dark" href="/albums">Go to my albums</a>
          <a className="btn btn-light" href="/index.html">Momento home</a>
        </div>
      </main>

      <footer>© 2026 HexArch Limited · <a href="/support">Support</a> · <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms</a></footer>
    </>
  );
}
