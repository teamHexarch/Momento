import { User } from '../models/User.js';
import { audit } from './auditService.js';

// Staff used to be a separate "role" field; now it's the 'staff' plan (utils/plans.js). Runs at every start
// and does nothing once no account has the old field: staff keep their access, everyone else just loses it.
// (The raw collection, since the field is no longer in the schema.)
export async function moveStaffRoleToPlan() {
  const staff = await User.collection.find({ role: 'staff' }, { projection: { _id: 1, plan: 1 } }).toArray();
  for (const user of staff) {
    await User.collection.updateOne({ _id: user._id, role: 'staff' }, { $set: { plan: 'staff' }, $unset: { role: '' } });
    await audit('staff.plan-changed', { actor: null, target: user._id, meta: { from: user.plan, to: 'staff', by: 'role field migration' } });
  }
  const rest = await User.collection.updateMany({ role: { $exists: true } }, { $unset: { role: '' } });
  if (staff.length || rest.modifiedCount) {
    console.log(`Staff role moved to the staff plan: ${staff.length} staff account(s); old role field removed from ${staff.length + rest.modifiedCount}.`);
  }
  return { staff: staff.length, cleared: rest.modifiedCount };
}
