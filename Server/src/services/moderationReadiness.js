import sharp from 'sharp';
import { classify, lastStage } from './uploadChecks.js';

// Exercise model inference without connecting to the album database or storing a photo.
export async function verifyModerationModels() {
  const image = await sharp({ create: { width: 224, height: 224, channels: 3, background: '#749876' } }).png().toBuffer();
  const probability = value => Number.isFinite(value) && value >= 0 && value <= 1;
  for (let stage = 1; stage <= lastStage; stage++) {
    const scores = await classify(stage, image);
    if (!probability(scores.allow) || (stage === 3 &&
        (!probability(scores.reject) || ![0, 15, 25, 50, 75, 100].includes(scores.severity)))) {
      throw new Error('Invalid readiness prediction at moderation stage ' + stage);
    }
    console.log('Moderation readiness: stage %d completed real inference.', stage);
  }
}
