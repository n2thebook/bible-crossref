#!/bin/sh
# Publishes the site to a temporary Netlify URL with no account. The site is deleted after 1 hour
# unless someone claims it (requires logging in to / creating a Netlify account).
cd "$(dirname "$0")" && npx -y netlify-cli deploy --dir=. --no-build --prod --allow-anonymous --json
