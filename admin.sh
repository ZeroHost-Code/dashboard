#!/bin/bash
# ZeroHost Dashboard - Admin Account Management
#
# Usage:
#   ./admin.sh create <email> <username> <password>
#     Create a new admin account
#
#   ./admin.sh set-admin <email>
#     Set an existing user as admin by email
#
#   ./admin.sh set-admin-by-username <username>
#     Set an existing user as admin by username
#
#   ./admin.sh list
#     List all admin users
#
#   ./admin.sh remove-admin <email>
#     Remove admin privileges from a user

cd "$(dirname "$0")"
node scripts/admin-cli.js "$@"
