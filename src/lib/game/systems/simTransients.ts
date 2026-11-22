import { resetUnreachableJobs } from './pawn/pawnHelpers';
import { _resetRallyCooldowns } from './pawn/rally';
import { resetSocialTransients } from '../services/SocialService';

export function resetSimTransients(): void {
  resetUnreachableJobs();
  resetSocialTransients();
  _resetRallyCooldowns();
}
