# Outreach kit: one question, five emails

Goal: ask "would you take a weekly ward-level digest of geotagged potholes with photos?" and nothing else.

1. Open `tracker.csv`. Rows 1-5 have a checked email address (checked 2026-11-01, source in the row).
2. For each row: copy `email_en.md` or `email_bn.md` (column `language`), replace the greeting with the `greeting` column, attach `sample_digest.pdf`, send.
3. Fill `sent_on`. When a reply comes, fill `reply` (yes / no / question) and `reply_on`.
4. Rows 6-8 have no confirmed email yet. Find one, or skip them this round.

`sample_digest.pdf` is printed from `sample_digest.html` (Chrome, print to PDF). All of its rows are invented demo data and the page says so.
