// Why staff gave a photo its content level (review.html tick boxes). Every staff review needs a level and at least
// one reason, so each decision records what was seen, what was happening, and the context it was judged in.
// Keys are stored on ModerationDecision.reasons; the labels shown to staff live in review.html (keep both in step).
//
// Three things move a level:
//   look     how much is shown: from everyday clothes up to full nudity
//   meaning  what the picture is doing: a pose, a gesture, touching or an act can make a fully clothed photo
//            explicit (for example masturbating while dressed is level 100, not 0)
//   context  where and why: art, medical, beach or sport can lower it; someone who may be under 18 never publishes
export const REVIEW_REASONS = {
  look: ['clothed', 'swimwear', 'underwear', 'revealing', 'partial-nudity', 'breasts', 'genitals', 'full-nudity'],
  meaning: ['sexual-pose', 'sexual-gesture', 'touching', 'sexual-act', 'sex-toys'],
  context: ['art', 'medical', 'beach-sport', 'false-alarm', 'possible-minor', 'other'],
};
export const REASON_KEYS = Object.values(REVIEW_REASONS).flat();
// Reasons that never allow publishing, whatever level was chosen
export const MUST_STAY_PRIVATE = ['possible-minor'];

// How the automatic check learns from the reasons (services/reviewCalibration.js, calibrationTable.js):
// a photo kept private for a serious reason weighs SERIOUS_WEIGHT times as much against its score range (the model
// misses acts and context, so one such miss should outweigh one ordinary approval), and a score range where staff
// ever flagged a possible minor never publishes on its own.
export const SERIOUS = ['possible-minor', 'touching', 'sexual-act', 'sex-toys', 'sexual-gesture', 'genitals', 'full-nudity'];
export const SERIOUS_WEIGHT = 3;
export const VETO = ['possible-minor'];
// A kept-private photo the model scored at least this "allow" (looked safe) is one of its blind spots
export const BLIND_SPOT_ALLOW = 0.75;
