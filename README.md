# MedVault — MERN Medical Record & Health Analytics Platform

An interview-ready full-stack project for patient-owned medical records, consent-based doctor access, QR workflows, online prescriptions, appointments, BMI/calorie guidance, food tracking, and longitudinal blood-report analytics.

> **Important:** This repository is an educational/demo system, not a certified medical device or production EHR. Automated analytics are not diagnosis or treatment advice.

## Highlights

- **Patient / Doctor authentication** with BCrypt + JWT.
- **Patient-controlled doctor access** using time-limited `AccessGrant` records.
- **Secure QR workflow:** each patient has an opaque QR identifier; the QR contains no medical data.
- **Doctor QR scanner:** camera scanning plus manual fallback in the React website.
- **Emergency break-glass path:** optional patient setting + doctor reason + audit log.
- **Medical record vault:** upload PDF/JPG/PNG/CSV; files are never exposed through a public static directory.
- **Digital prescriptions:** authorized doctors can issue medicines/advice directly to the patient record.
- **Appointment scheduling:** patient requests, doctor confirmation/completion/cancellation.
- **BMI / BMR / TDEE / calorie target** calculator.
- **Food photo calorie tracking** with Gemini structured food recognition, per-item portion ranges, Indian recipe matching, ingredient-based nutrition calculations, an editable review step, and daily logging.
- **Longitudinal blood reports:** structured entry or CSV import, per-analyte time-series charts and reference-range flags.
- **Python analytics/vision microservice:** privacy-aware image preprocessing and Gemini vision analysis, plus linear-regression trend forecasts and Isolation Forest anomaly candidates.
- **Audit logging** for sensitive data access and consent events.
- **Docker Compose**, demo seed, CI workflow, system-design and interview docs.

## Architecture at a glance

```text
React Patient/Doctor UI
        |
        v
Node + Express REST API
  |-- Auth / RBAC / Consent / Audit
  |-- Records / Rx / Appointments / Wellness / Labs
  |-- MongoDB (logs, nutrition cache, ingredient breakdowns)
  |-- Local Indian Nutrient Databank + USDA FoodData Central (nutrient lookup)
  `-- Python image/recipe service -> configured vision model (after user consent)

Private file storage in demo
(S3/Blob recommended in production)
```

See **`docs/SYSTEM_DESIGN.md`** for architecture, ER model, QR sequence diagram, scaling plan, security model, ML boundary and production design.
See **`docs/FOOD_ESTIMATION_EVALUATION.md`** for a weigh-and-compare protocol before claiming calorie accuracy.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, React Router, Axios, Recharts, html5-qrcode, Lucide |
| API | Node.js, Express, Mongoose |
| Database | MongoDB |
| Auth | JWT + BCrypt |
| Files | Multer + protected local storage in demo |
| QR | `qrcode` generation + browser camera scanner |
| Food analysis | FastAPI image preprocessing + Gemini structured vision + USDA FoodData Central |
| Lab analytics | scikit-learn trends and anomaly candidates |
| DevOps | Docker Compose + GitHub Actions |

## Quick start — local development

### Prerequisites

- Node.js 22+
- npm 10+
- MongoDB 7+ locally, or Docker
- Python 3.12 for image preprocessing and lab analytics

### 1. Install JavaScript dependencies

```bash
npm install
```

### 2. Configure the API

```bash
cp server/.env.example server/.env
```

For local development, change `JWT_SECRET` and add a Gemini API key to `server/.env` as `GEMINI_API_KEY` (create one in [Google AI Studio](https://aistudio.google.com/app/apikey)). `FOOD_VISION_PROVIDER=gemini` and `GEMINI_FOOD_MODEL=gemini-3.5-flash-lite` are the defaults. `FDC_API_KEY` is optional; the app uses USDA's low-limit `DEMO_KEY` until you add a free FoodData Central API key.

### Set up the local ML service

```powershell
cd ml-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

Photo analysis works as a reviewable pipeline:

1. The patient explicitly consents to send the meal photo and any later clarification answers to the configured vision provider.
2. The Python service validates the image, applies EXIF orientation, resizes it, strips metadata, and sends the compressed image plus optional description to Gemini by default.
3. The model returns structured food names, categories, portion estimates, gram ranges, and visual confidence. It does not return calories or macros.
4. The Node API prefers exact local Indian Nutrient Databank recipes. If a recipe is missing or ambiguous, Gemini interprets the user's ingredient answer and the API combines per-ingredient values from the nutrition databases. Gemini never supplies the calorie or macro totals.
5. The API calculates nutrition from the image-estimated portion, stores the ingredient breakdown and database sources, and shows recipe uncertainty. The patient can review portions and assumptions before logging.

Meal photos are processed in memory and are not stored by this application. Photos, optional descriptions, and recipe clarification answers are sent to the configured vision provider (Gemini by default) after consent. Food names and ingredient names are used for nutrition lookup; the database supplies nutrient values while the model estimates only ingredient proportions. If Gemini's free tier is used, Google may use submitted content to improve its products. USDA lookups use a MongoDB cache and fall back to its low-limit `DEMO_KEY` if `FDC_API_KEY` is not configured. A photo cannot reveal exact depth, recipe, oil, or hidden ingredients, so portion and recipe estimates include uncertainty and remain reviewable.

### 3. Start MongoDB

Use your local MongoDB on `mongodb://127.0.0.1:27017/medical_vault`, or:

```bash
docker run --name medvault-mongo -p 27017:27017 -d mongo:7
```

### 4. Seed demo data

```bash
npm run seed
```

Demo accounts:

```text
Patient: patient@demo.com
Doctor:  doctor@demo.com
Password: Demo@123
```

The seeded patient and doctor already have an active access grant so the QR flow can be demonstrated immediately.

### 5. Start React, Express, and the Python ML service

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:5000/api`

To open the app from a phone on the same Wi-Fi, find your computer's LAN IPv4 address and open `http://<LAN-IP>:5173` on the phone (for example, `http://192.168.1.25:5173`). Allow the development server through the computer's firewall if prompted. Generate/refresh the patient's QR while the app is opened using that LAN address; the QR then points to the same reachable app address. For Docker or another deployment, set `PUBLIC_APP_URL` to the URL phones will use before starting the services.

Phone browsers require HTTPS (or localhost) to grant camera access to the in-app doctor scanner. For local Wi-Fi testing, serve the app over HTTPS with a trusted development certificate; otherwise scan the patient's QR with the phone's camera app to open the patient route, then sign in as a doctor. The QR URL only identifies the patient and server-side consent checks still apply.


## Quick start — Docker Compose

Before starting, copy `server/.env.example` to `server/.env`, configure `GEMINI_API_KEY`, then start the stack. Add `FDC_API_KEY` to avoid the USDA demo key's low rate limit.

```bash
docker compose up --build
```

Then seed once:

```bash
docker compose exec server npm run seed
```

Open `http://localhost:5173`.

## Suggested demo flow

1. Sign in as the **patient**.
2. Show the generated QR and explain that it stores only an opaque identifier.
3. Open **Labs** and import `docs/sample-labs.csv` or add values manually.
4. Show a biomarker trend chart and out-of-range indicator.
5. Open **Wellness**, upload a meal photo, review per-food portion ranges and nutrition matches, answer only the questions shown for uncertain foods, review ingredient assumptions, then confirm the calculated calorie and macro log.
6. Sign out and log in as the **doctor**.
7. Open **Scan QR** and scan/paste the patient's QR.
8. Review the patient snapshot and open authorized records.
9. Create a digital prescription.
10. Return to the patient account and show the prescription.
11. Open `docs/SYSTEM_DESIGN.md` during the technical discussion.

## Blood-report handling

The project supports two related workflows:

1. **Vault upload:** arbitrary PDF/JPG/PNG blood reports can be stored and securely shared.
2. **Longitudinal analytics:** structured analytes and CSV imports are normalized into time series for charts/trend analysis.

For automatic extraction from arbitrary lab PDFs/images, the system-design document defines an OCR/Document-AI pipeline with canonical test-name mapping, unit normalization, confidence scoring, and human confirmation. That part deliberately requires an external provider/model rather than pretending every report layout can be parsed reliably with hard-coded regex.

## Security choices worth explaining in an interview

- A QR code is an **identifier, not a bearer credential**.
- Doctor role alone is insufficient; doctors need a **patient-specific active grant**.
- File downloads pass through the same authorization boundary as record metadata.
- Emergency access is explicit, reasoned and audit logged.
- ML is outside the critical security path and can fail without blocking care workflows.
- Production would move files to private object storage and use short-lived presigned download URLs after API authorization.

## Project structure

```text
medical-vault/
├─ client/                 React/Vite web app
│  └─ src/
│     ├─ components/
│     ├─ context/
│     └─ pages/
├─ server/                 Express/Mongo API
│  ├─ src/
│  │  ├─ models/
│  │  ├─ routes/
│  │  ├─ middleware/
│  │  └─ utils/
│  └─ test/
├─ ml-service/             FastAPI image preprocessing + scikit-learn analytics
├─ docs/
│  ├─ SYSTEM_DESIGN.md
│  ├─ INTERVIEW_GUIDE.md
│  ├─ API.md
│  └─ sample-labs.csv
├─ docker-compose.yml
└─ .github/workflows/ci.yml
```

## Tests

```bash
npm test
```

The included unit test validates the wellness calculation. The CI workflow also builds the React frontend and syntax-checks the Python service.

## Where to extend it next

- FHIR/SMART-on-FHIR interoperability.
- Verified doctor onboarding / license verification.
- MFA and refresh-token rotation/revocation.
- Object storage, malware scanning and encrypted presigned downloads.
- Async OCR/document extraction workers.
- Email/SMS/push appointment reminders.
- Video-consultation provider integration.
- Pharmacy fulfilment workflow.
- Wearables / Apple Health / Google Health Connect ingestion.
- Unit normalization and standard terminology (LOINC/SNOMED where appropriate).
- Admin/security dashboard and SIEM export.

## Interview preparation

Read **`docs/INTERVIEW_GUIDE.md`**. It contains a 60-second pitch, likely questions, design trade-offs, a live demo sequence and a resume bullet.

## v2: Admin, provider network scheduling and all-report intelligence

This upgraded build uses **MongoDB** (via Mongoose) as the primary database. The new models include `Organization`, `DoctorMembership`, `DoctorSchedule`, `HealthReport`, and an expanded `Appointment` model in addition to the original patient, access, record, prescription, wellness and audit collections.

### Demo accounts

- Patient: `patient@demo.com` / `Demo@123`
- Doctor: `doctor@demo.com` / `Demo@123`
- Super Admin: `admin@demo.com` / `Demo@123`

The demo admin has `user_admin`, `provider_admin`, `appointment_admin`, `compliance_read`, and `clinical_data_read`. Clinical-data access is intentionally audited. In a real healthcare deployment, operational administrators should not automatically receive unrestricted PHI access; use least privilege and separate compliance/clinical roles.

### Provider-network appointment architecture

Appointments now follow this hierarchy:

`Organization (hospital / clinic / private practice) -> Location -> Doctor membership -> Service -> Doctor schedule -> Generated available slots -> Booking`

A solo/private doctor is represented as a `private_practice` organization with one doctor. A hospital may have many locations and hundreds of memberships. Availability is generated from recurring weekly windows and date exceptions, existing bookings are removed, and unique 5-minute occupied-slot keys protect against same-start and overlapping double bookings. Doctors can publish their own recurring availability; admins can create organizations, memberships and schedules through the API.

### Unified report analytics

The new `HealthReport` model is intentionally broader than blood reports. It supports structured data from:

- blood and laboratory reports
- urinalysis
- vitals
- radiology/imaging
- pathology
- ECG
- echocardiography
- discharge summaries
- prescriptions
- vaccinations
- other medical reports

Numeric measurements can be normalized and trended over time across report types. Narrative reports can store findings, impressions and summaries in a longitudinal timeline. Examples of trendable values include HbA1c, creatinine, hemoglobin, blood pressure, heart rate, QTc, LVEF and lesion dimensions when those values are available in structured form.

CSV extraction is supported locally. For PDF/image OCR and richer document extraction, configure `DOCUMENT_AI_URL` with a separate service exposing `POST /extract-report`. This keeps the core vault vendor-neutral and makes it possible to plug in OCR + LLM/document-AI providers without rewriting the MERN application.

Automated extraction, range flags, anomaly detection and forecasting are **decision-support only** and are never presented as diagnosis or treatment advice.
