export default function Backdrop() {
  return (
    <>
      <canvas className="bg" id="bg" aria-hidden="true"></canvas>
      <div className="grain" aria-hidden="true"></div>
      <div className="cursor" id="cursor" aria-hidden="true"><span></span></div>
    </>
  );
}
