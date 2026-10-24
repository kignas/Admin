'use strict';

/**
 * One-account recovery for Eatswada's fail-closed admin permission policy.
 *
 * Dry-run by default. This does NOT change the database unless BOTH are true:
 *   1) command includes --apply
 *   2) CONFIRM_FULL_ADMIN=YES
 * and ADMIN_EMAIL exactly identifies one active role=admin account.
 *
 * Run from the backend project root so .env is loaded.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const apply = process.argv.includes('--apply');
  const explicitlyConfirmed = process.env.CONFIRM_FULL_ADMIN === 'YES';

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set. Run this from the backend root with its environment configured.');
  }
  if (!email || !email.includes('@')) {
    throw new Error('Set ADMIN_EMAIL to the exact email of the trusted owner/admin account.');
  }
  if (apply && !explicitlyConfirmed) {
    throw new Error('Refusing to apply: set CONFIRM_FULL_ADMIN=YES as well as --apply.');
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  try {
    const user = await User.findOne({ email }).select('_id name email role isActive permissions').lean();

    if (!user) throw new Error('No account found for ADMIN_EMAIL. No changes made.');
    if (user.role !== 'admin') throw new Error('Matched account is not role=admin. No changes made.');
    if (user.isActive !== true) throw new Error('Matched admin account is not active. No changes made.');

    const before = Array.isArray(user.permissions) ? user.permissions : null;
    console.log(JSON.stringify({
      mode: apply ? 'APPLY' : 'DRY_RUN',
      matchedAccount: { name: user.name || '', email: user.email, role: user.role, active: user.isActive },
      currentPermissions: before,
      plannedPermissions: ['*'],
      databaseChanged: false,
    }, null, 2));

    if (!apply) {
      console.log('Dry run only. To apply, rerun with ADMIN_EMAIL set, CONFIRM_FULL_ADMIN=YES, and --apply.');
      return;
    }

    const result = await User.updateOne(
      { _id: user._id, role: 'admin', isActive: true },
      { $set: { permissions: ['*'] } }
    );

    if (result.modifiedCount !== 1) {
      throw new Error('Expected to update exactly one active admin account; no success can be confirmed.');
    }

    console.log('SUCCESS: Full-admin permission was granted to exactly the selected active admin account.');
    console.log('No other account was modified. The admin should log out and log back in, then refresh the dashboard.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (err) => {
  console.error(`FAILED: ${err.message}`);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exitCode = 1;
});
