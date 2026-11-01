# Interview Guide: How to Present MedVault

## 60-second pitch

> MedVault is a consent-first personal health record system built with React, Node/Express and MongoDB. Patients upload records, manage time-limited doctor access, receive digital prescriptions, book appointments, track BMI/calories and view lab trends over time. Every patient has a QR code, but the QR never contains health data—it resolves to an opaque ID, and the API still enforces doctor authentication and patient consent. A separate Python analytics service performs trend forecasting and anomaly detection, while deterministic checks remain available even if ML is down.

## What makes the project stronger than a basic CRUD app

The calorie flow combines structured vision recognition and portion ranges with USDA nutrient data, then asks the patient to review the draft before it becomes a meal log.

1. **Authorization is domain-aware.** Role-based access alone is not enough; a doctor also needs an active patient-specific grant.
2. **QR design models a real threat.** A photographed QR cannot directly reveal medical data.
3. **Sensitive file delivery is protected.** Upload files are not exposed as a public `/uploads` directory.
4. **Auditability is first-class.** Reads, grants and emergency access are logged.
5. **AI output is grounded and reviewable.** The vision model identifies foods and portions; USDA supplies nutrient facts; users can correct the draft before it becomes a log.
6. **Longitudinal data is modeled as a time series.** Repeated lab results are grouped by analyte instead of treated as unrelated PDFs.
7. **The architecture has a production migration path.** Local file storage can become object storage; synchronous demo flows can become queues/jobs.

## Deep-dive questions you can answer

### Why not put medical data in the QR code?
Because QR codes are easy to copy. The code should act like an identifier, not a database. Authorization belongs on the server.

### What if a doctor needs data in an emergency?
The model includes an opt-in break-glass flow. A doctor supplies a reason and the access is audit logged. A production implementation would add stronger verification and alerts.

### How do you prevent Doctor A from reading Patient B?
Every patient-scoped route checks both the authenticated doctor ID and an active, unexpired `AccessGrant(patient, doctor)`. The same check protects record files and prescription creation.

### How does photo-based calorie estimation work?
The configured vision model (Gemini by default, with OpenAI as an option) returns structured food labels, categories, and portion ranges; it is explicitly not asked for calories. The Node API searches USDA FoodData Central and calculates each nutrient as `portion grams × USDA value per 100 g ÷ 100`. Users can replace a food match, edit grams, add or remove items, and confirm. Mongo stores the original AI estimate alongside the user's final portion and nutrition source. The app strips EXIF metadata, does not store the meal photo, and only sends it to the selected provider after the user checks the consent box.

This is still an estimate: one photo cannot reveal food depth, exact plate size, recipe, or hidden oil. A portion range plus review is more honest and auditable than presenting a single unqualified number.

### Why keep a separate Python service?
FastAPI does image decoding, EXIF orientation, resizing, metadata removal, and the structured vision request. The Node API owns patient authentication, explicit consent, USDA lookup, cache, calculation, and persistence. The boundary keeps provider keys out of the browser and makes it possible to replace the vision provider without changing meal-log storage.

### How are arbitrary blood-test PDFs handled?
The demo stores any allowed PDF/image in the vault and analyzes structured data/CSV. Production adds OCR/document AI, canonical analyte mapping, unit normalization and a human confirmation step before charting extracted values.

### How would you integrate hospitals?
Use FHIR resources and OAuth/SMART-on-FHIR where supported. Keep a translation layer between external clinical schemas and the internal patient timeline.

### What would you change for production?
Private S3/Blob storage, presigned URLs, MFA, refresh-token rotation/revocation, verified clinician onboarding, rate limiting, KMS-managed encryption, malware scanning, Redis/queues, notification service, FHIR interoperability, observability, backup/restore exercises, security review and jurisdiction-specific compliance work.

## Suggested live demo

1. Run the seed script.
2. Log in as the patient and show the QR, records, lab trends and calorie dashboard.
3. Log out and sign in as the doctor.
4. Scan/paste the patient QR.
5. Explain that access is server-authorized; use the seeded active grant or demonstrate request/approve.
6. Open the patient medical snapshot.
7. Create a digital prescription.
8. Return to the patient account and show the new prescription.
9. Import `docs/sample-labs.csv` and show the time-series chart.
10. Open `docs/SYSTEM_DESIGN.md` to explain scaling and security trade-offs.

## Resume bullet

> Built a consent-driven MERN personal-health-record platform with secure document vaulting, QR-based clinician access, RBAC + patient-specific authorization, digital prescriptions, appointments, calorie/BMI tracking, longitudinal lab analytics, audit trails, and a decoupled Python ML service for trend/anomaly analysis.

## Strong v2 interview talking points

**Why MongoDB?** Medical records, prescriptions and reports have heterogeneous schemas and evolve frequently. MongoDB gives the prototype flexible document modeling while Mongoose schemas still enforce important constraints and indexes. At larger scale, I would consider a polyglot architecture: MongoDB/document storage for clinical aggregates, object storage for files, Redis for availability/cache, and possibly PostgreSQL for highly transactional billing/claims.

**How do hospitals, clinics and private doctors fit one scheduler?** I model all of them as organizations. A private doctor is a one-doctor private-practice organization. Doctors join organizations through memberships that define locations and services. Availability belongs to doctor + organization + location. That removes special cases and supports doctors working in multiple places.

**How do you avoid double booking?** Availability is recalculated immediately before booking, conflicts are filtered, and the appointment stores unique 5-minute `occupiedSlotKeys` covering its entire duration (plus a start `slotKey`). MongoDB enforces uniqueness across these bucket keys, so concurrent same-start or overlapping bookings cause one insert to fail with HTTP 409.

**Can the admin see everything?** The demo super-admin can because the requirement is to demonstrate full administration, but clinical access is a separate permission and every privileged read is audited. In a production healthcare system, operational admins should not automatically have PHI access; least privilege is the safer architecture.

**Is report AI diagnosing patients?** No. The system extracts/normalizes measurements and report findings, displays report-provided range flags, trend lines and exploratory anomaly signals. It explicitly does not diagnose or recommend treatment. Source documents and extraction provenance are retained so clinicians can verify the result.

**Why not hard-code one OCR vendor?** The core API calls an optional `DOCUMENT_AI_URL` extraction service. That makes the vault independent of a specific OCR/LLM provider and lets the team swap cloud document AI, local OCR or a specialized clinical extraction model without changing the MERN domain.
