# PotholeAlertBD: Product Requirements Document

Language rules: this document follows ASD-STE100 (Simplified Technical English).

Status words: DONE means the code exists in the repository. NEW means another agent is adding it now. OPEN means no solution exists yet.

## 1. Problem

Roads in Bangladesh have potholes. Citizens have no simple way to report them. No public record shows which authority is responsible for a road. Citizens cannot see if an authority repairs a pothole.

The product lets a citizen report a pothole with a photo and a location. The product finds the responsible authority. The product shows all reports on a public map and in public statistics.

Important fact: no authority receives reports today. Every authority contact is null. Reports stay in the queue with status `queued_for_authority`. The product is a demonstration, not a working complaint channel.

## 2. Users

| User | Description | Main need |
|---|---|---|
| Citizen reporter | Person with a phone. Uses the Bangla interface. Wants no account. | Send a report in less than one minute. |
| Public viewer | Person who reads the feed, map and statistics. | See where potholes are and what happened. |
| Authority officer | Staff of RHD, a city corporation, LGED or a union council. | Receive reports. Mark them as in progress or resolved. |
| Administrator | Operator of the service. | Moderate reports. Fix wrong data. |

## 3. Goals and non-goals

### 3.1 Goals

- G1. A citizen sends a report with a photo and a location, with no name.
- G2. The system routes each report to the responsible authority.
- G3. The authority receives the report and updates its status.
- G4. The public sees the status of each report.
- G5. The system protects the privacy of reporters.
- G6. One Flutter code base runs on Android, iOS and web.

### 3.2 Non-goals

- N1. The product is not an official government complaint system.
- N2. The product does not give survey-grade location data.
- N3. The product does not repair roads or track repair work orders.
- N4. The product has no reporter accounts or login.
- N5. The product does not detect potholes with machine vision.
- N6. The product does not work offline. A queue for offline reports is not planned.

## 4. Current state

| Item | State |
|---|---|
| Report submit, list, detail, statistics | DONE |
| Duplicate detection (30 m, 24 hours, same road type) | DONE |
| Flagging and auto-hide after 3 distinct flags | DONE |
| Admin page with one shared token | DONE |
| Email forwarding through SMTP | DONE in code. It sends nothing because all contacts are null. |
| Phone number consent and privacy page | DONE. A lawyer has not reviewed the page. |
| Real authority contacts | OPEN |
| Real jurisdiction polygons | OPEN |
| Hosting, HTTPS, backups | OPEN |
| Test on a real device | OPEN |
| Authority inbox, per-admin tokens, audit log, shared rate limits, phone retention | NEW |

## 5. Functional requirements

### 5.1 Reporting (DONE)

- FR-1. The app shall require one photo with each report.
- FR-2. The backend shall accept only JPEG, PNG and WebP files. It shall check the file content, not the file name.
- FR-3. The backend shall reject a photo larger than 8 MB with an error.
- FR-4. The backend shall reject a photo of more than 40 million pixels with status 413.
- FR-5. The backend shall remove EXIF and GPS data from each stored photo.
- FR-6. The backend shall require latitude and longitude. It shall reject a point outside Bangladesh.
- FR-7. The app shall let the user get the location from GPS. The user can also select it on the map.
- FR-8. The app shall let the user select one road type. The types are: national highway, regional highway, city road, rural road, residential road, other.
- FR-9. The backend shall store severity as low, medium or high. The default is medium.
- FR-10. The backend shall limit description to 1000 characters and place note to 300 characters.
- FR-11. The backend shall return the existing report with `duplicate: true` if a report of the same road type exists within 30 m during the last 24 hours.
- FR-12. The app shall tell the user about a duplicate. It shall offer a link to the existing report.
- FR-13. The backend shall accept 20 new reports for each client IP address in one hour. It shall return status 429 above this limit.

### 5.2 Contact data (DONE)

- FR-14. The name and the phone number shall be optional.
- FR-15. The app shall show a consent dialog before the user enters contact data.
- FR-16. The backend shall show the name and the phone number only in admin responses. Public responses shall not include them.
- FR-17. The app shall accept only a valid Bangladeshi phone number.

### 5.3 Public views (DONE)

- FR-18. The app shall show a feed of reports with the newest first.
- FR-19. The app shall show reports on a map with OpenStreetMap tiles.
- FR-20. The app shall show statistics for each division, road type and severity.
- FR-21. The feed shall support filters for division, road type and status.
- FR-22. The list route shall return 50 reports by default and 200 at most. It shall return the total in the `X-Total-Count` header.
- FR-23. The public routes shall not return hidden reports.
- FR-24. The app and the privacy page shall use Bangla. The privacy page shall also use English.

### 5.4 Authority routing and forwarding

- FR-25. The backend shall find the division from the location. It uses the nearest division center, so the result is approximate. (DONE)
- FR-26. The backend shall use RHD for national and regional highways. (DONE)
- FR-27. The backend shall use LGED for rural roads. It shall use a union council for residential roads. (DONE)
- FR-28. The backend shall use a polygon to find a city corporation for city roads. (DONE, but the polygons are placeholders. See C-1.)
- FR-29. The backend shall send each new report to the authority email address when SMTP and the address exist. The email shall include the photo. (DONE)
- FR-30. The backend shall set status `forwarded` after a successful send. Otherwise it shall set `queued_for_authority`. (DONE)
- FR-31. The backend shall never send a report to an unverified address. (DONE: no address exists.)
- FR-32. The admin shall set each authority contact without a code change. (OPEN)

### 5.5 Moderation (DONE)

- FR-33. A user can flag a report. One IP address can flag one report only once.
- FR-34. The backend shall hide a report after 3 flags from different IP addresses.
- FR-35. A flag shall change only reports with status `new`, `queued_for_authority` or `flagged`.
- FR-36. The admin shall list, change, unhide and delete reports.
- FR-37. The backend shall delete the photo file when the admin deletes a report.
- FR-38. The backend shall limit each admin route to 30 requests each minute for each IP address. It shall block an IP address after 10 failed logins in 15 minutes.

### 5.6 Authority inbox (NEW)

- FR-39. The system shall give each authority one secret token. A token shall be valid for one authority only.
- FR-40. An authority token shall show only the reports routed to that authority.
- FR-41. An authority token shall not show reports of other authorities. It shall not call admin routes.
- FR-42. The authority shall set a report to `in_progress` or `resolved`.
- FR-43. The system shall require an after photo to set `resolved`. The after photo shall follow rules FR-2 to FR-5.
- FR-44. The public detail page shall show the after photo of a resolved report.
- FR-45. The system shall send one digest email each day to each authority. The email shall list new and open reports. The system shall not send an empty digest.
- FR-46. The admin shall revoke an authority token. A revoked token shall return status 401.

### 5.7 Admin accounts and audit log (NEW)

- FR-47. The system shall give each administrator a separate token.
- FR-48. The system shall not use one shared admin token after this change.
- FR-49. The system shall record each admin write action in an audit log. The actions are status change, hide, unhide, delete, token creation and token revocation.
- FR-50. Each audit entry shall contain the admin identity, the action, the report ID, the time and the previous status.
- FR-51. The system shall not allow a change or a deletion of audit entries through the API.
- FR-52. The admin shall read the audit log in the admin page.

### 5.8 Shared rate limits (NEW)

- FR-53. The system shall store rate-limit counters in SQLite.
- FR-54. Rate limits shall stay in force after a restart.
- FR-55. Two server processes that use the same database shall share one counter for each client.
- FR-56. The system shall use the same limits as in FR-13 and FR-38.
- FR-57. The system shall delete expired counters automatically.

### 5.9 Phone number retention (NEW)

- FR-58. The system shall erase the phone number of a report 90 days after the report creation date. The default period is 90.
- FR-59. The operator shall change the period with a setting.
- FR-60. The erase job shall run at least one time each day.
- FR-61. The erase job shall set the phone field to null. It shall keep the rest of the report.
- FR-62. The system shall also erase the contact name at the same time.
- FR-63. The erase job shall write one log line with the number of erased records. The line shall not contain a phone number.
- FR-64. The admin shall erase a phone number on request before the end of the period.

## 6. Non-functional requirements

### 6.1 Security

- NFR-1. The server shall refuse to start in production without an admin token of 16 characters or more. (DONE)
- NFR-2. The server shall compare tokens in constant time. (DONE)
- NFR-3. The admin page shall pass the `scripts/lint-innerhtml.sh` check. (DONE)
- NFR-4. The server shall set the headers nosniff, frame deny, no-referrer and a Content-Security-Policy. (DONE)
- NFR-5. The server shall refuse an invalid `TRUST_PROXY` value at start. (DONE)
- NFR-6. The system shall store tokens as hashes. (NEW, applies to FR-39 and FR-47)
- NFR-7. Each token shall have at least 128 bits of random data. (NEW)

### 6.2 Privacy

- NFR-8. The public API shall never return a phone number, a name or an EXIF field. (DONE)
- NFR-9. The privacy page shall say how long the system keeps the phone number. (NEW, with FR-58)
- NFR-10. A lawyer shall review the privacy page before launch. (OPEN)

### 6.3 Performance

- NFR-11. The list route shall answer in 500 ms or less for a database of 100,000 reports. This target has not been measured.
- NFR-12. The submit route shall answer in 5 seconds or less for an 8 MB photo on one CPU core. This target has not been measured.

### 6.4 Reliability

- NFR-13. The system shall make a database backup each day. (OPEN)
- NFR-14. A failed email send shall not fail the submit request. (DONE)
- NFR-15. The system shall report health at `GET /api/health`. (DONE)

### 6.5 Quality

- NFR-16. The command `scripts/check.sh` shall pass before each commit. (DONE)
- NFR-17. The backend tests shall not use the real database. (DONE)
- NFR-18. Each NEW requirement in section 5 shall have at least one automated test.
- NFR-19. The consent dialog and the duplicate dialog shall have widget tests. (OPEN)

### 6.6 Compatibility

- NFR-20. The backend shall run on Node 22.5 or later. It shall use the built-in `node:sqlite` module.
- NFR-21. The app shall build for Android, iOS and web. Only the web and analysis builds have been run. No device test exists. (OPEN)

## 7. Constraints

- C-1. **Jurisdiction polygons are placeholders.** The boxes for DNCC, DSCC and CCC in `backend/src/data/jurisdictions.json` are approximate. They name real city corporations. This is an open constraint, not a finished feature. The product shall not go public until real boundary data replaces them.
- C-2. **Authority contacts are null.** No authority email or phone number exists in the code. No report reaches an authority. This is an open constraint, not a finished feature. FR-29 to FR-31, FR-39 to FR-46 have no effect until one authority agrees to take part.
- C-3. Division detection uses the nearest center. A report near a division border can get the wrong division.
- C-4. The product has no host. HTTPS, backups and monitoring do not exist.
- C-5. SQLite runs on one server. The product has no plan for more than one server host.
- C-6. The operator shall set `TRUST_PROXY` correctly in production. A wrong value makes all users share one IP address.
- C-7. Photos are not moderated until three users flag them. The system does not blur faces or number plates.
- C-8. The map uses the public OpenStreetMap tile server. It has a usage policy that limits heavy traffic.
- C-9. A person has not reviewed the agent-written code. A device has not run the app.

## 8. Success metrics

The targets below are proposals. No baseline exists today.

| ID | Metric | Target | How to measure |
|---|---|---|---|
| M-1 | Reports sent to a real authority contact | 100% of reports in the pilot area | Count `forwarded` reports divided by all pilot reports |
| M-2 | Reports with correct authority | 95% or more | Review of 100 random pilot reports by hand |
| M-3 | Reports set to `in_progress` or `resolved` by the authority | 30% within 30 days of the pilot start | Count by status |
| M-4 | Median time from report to first authority action | 7 days or less | Audit log and report timestamps |
| M-5 | Time for a citizen to send a report | 60 seconds or less | Test with 10 users |
| M-6 | Reports hidden by mistake | Less than 2% | Admin review of hidden reports |
| M-7 | Phone numbers older than 90 days | 0 | Database query each day |
| M-8 | Admin actions without an audit entry | 0 | Automated test and monthly check |
| M-9 | Check script pass rate on the main branch | 100% | CI result |

## 9. Open items before launch

1. Get one pilot authority and one named contact. (C-2)
2. Get real boundary data and delete the placeholder boxes. (C-1)
3. Select a host. Set up HTTPS, backups and an uptime check. (C-4)
4. Build and test the app on real Android and iOS phones. (NFR-21)
5. Get a legal review of the privacy page. (NFR-10)
6. Write a plan for photo moderation and for blurring faces and number plates. (C-7) The blurring plan is in `PHOTO_BLUR_PLAN.md`. Photo moderation has no plan yet.
