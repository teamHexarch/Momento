// Is this exactly one emoji? Any emoji counts (skin tones, flags, families, keycaps), not just a fixed list:
// one grapheme (what a person sees as one character) that is pictographic, a flag pair or a keycap
const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function isEmoji(e) {
  return typeof e === 'string' && e.length > 0 && e.length <= 32
    && [...seg.segment(e)].length === 1
    && /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]️?⃣/u.test(e);
}
