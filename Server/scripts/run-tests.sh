#!/bin/bash
# Momento's server tests (audit B2). The "Server tests" GitHub Action (.github/workflows/server-tests.yml) runs this
# on every push to main and every pull request; `sudo momento-update` only deploys a commit whose run passed.
# Locally, from Momento/Server:  bash scripts/run-tests.sh
# Each test runs on a throwaway in-memory database
# (mongodb-memory-server) with stand-ins for AWS (Rekognition, email), and is tried once more if it fails, since a
# few checks count requests against time-based rate limits. Any test that fails twice fails the run.
set -uo pipefail
[ -f package.json ] && [ -d src ] || { echo "Run this from Momento/Server"; exit 2; }

TESTS=(testUploadChecks testPaging testUploadConsent testAdminTotp testDirectUploads testStaffCodes)
failed=()
for t in "${TESTS[@]}"; do
  echo "::group::$t"
  if node "scripts/$t.js"; then ok=1; else
    echo "$t failed; trying once more"
    if node "scripts/$t.js"; then ok=1; else ok=0; fi
  fi
  echo "::endgroup::"
  if [ "$ok" = 1 ]; then echo "PASS $t"; else echo "FAIL $t"; failed+=("$t"); fi
done

echo
if [ ${#failed[@]} -gt 0 ]; then echo "Failed: ${failed[*]}"; exit 1; fi
echo "All ${#TESTS[@]} server test scripts passed."
