#!/bin/sh
set -e

cd "$(dirname "$0")"

git add .
git commit -m "Add customer accounts, order tracking, test-mode checkout, layout fixes, 360 product viewer"
git push origin main
