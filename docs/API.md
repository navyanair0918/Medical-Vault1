# API Overview

Base URL: `http://localhost:5000/api`

All protected routes use `Authorization: Bearer <JWT>`.

| Area | Method | Route | Role / rule |
|---|---|---|---|
| Auth | POST | `/auth/register` | Public |
| Auth | POST | `/auth/login` | Public |
| Auth | GET | `/auth/me` | Authenticated |
| Users | GET | `/users/doctors` | Authenticated |
| Users | PATCH | `/users/patient-profile` | Patient |
| QR | GET | `/qr/me` | Patient |
| QR | GET | `/qr/:publicQrId` | Doctor + grant, or audited emergency path |
| Access | POST | `/access/request` | Doctor |
| Access | POST | `/access/grant-by-email` | Patient |
| Access | GET | `/access/mine` | Patient/Doctor |
| Access | PATCH | `/access/:id` | Owning patient |
| Records | POST | `/records` | Patient |
| Records | GET | `/records/patient/:patientId` | Self or authorized doctor |
| Records | GET | `/records/:id/file` | Self or authorized doctor |
| Prescriptions | POST | `/prescriptions` | Authorized doctor |
| Prescriptions | GET | `/prescriptions/patient/:patientId` | Self or authorized doctor |
| Appointments | POST | `/appointments` | Patient |
| Appointments | GET | `/appointments/mine` | Patient/Doctor |
| Appointments | PATCH | `/appointments/:id` | Appointment participant |
| Wellness | POST | `/wellness/calculate` | Patient |
| Wellness | POST | `/wellness/food` | Patient; multipart `image`, `meal`, optional `description`, and `consent=true`; analyzes and creates a review draft |
| Wellness | GET | `/wellness/nutrition/search?q=&method=` | Patient; match Indian recipes first, then search USDA FoodData Central using the optional preparation hint |
| Wellness | PATCH | `/wellness/food/:id` | Patient; confirm edited item names, USDA source IDs, categories and gram portions; server recalculates and logs |
| Wellness | DELETE | `/wellness/food/:id` | Patient; discard an unconfirmed meal review |
| Wellness | GET | `/wellness/food` | Patient; daily logged meals and recent review drafts |
| Labs | POST | `/labs` | Self or authorized doctor |
| Labs | POST | `/labs/import-csv` | Patient |
| Labs | GET | `/labs/patient/:patientId` | Self or authorized doctor |
| Labs | GET | `/labs/trends/:patientId` | Self or authorized doctor |

Food photo analysis defaults to Gemini. Add `GEMINI_API_KEY` to `server/.env`; `FOOD_VISION_PROVIDER=gemini` and `GEMINI_FOOD_MODEL=gemini-3.5-flash-lite` are the defaults. After explicit consent, Node sends the image in memory to the Python service, which strips metadata and asks the selected vision model for structured food labels and portion ranges. The model does not return nutrient values. To use OpenAI instead, set `FOOD_VISION_PROVIDER=openai` and configure `OPENAI_API_KEY` and optionally `OPENAI_FOOD_MODEL`. Node looks up each food in USDA FoodData Central (`FDC_API_KEY` is optional but recommended), caches candidates in MongoDB, and computes macros from USDA values per 100 g. The patient can search for an alternative USDA match, edit portions, add/remove items, and confirm. Photos are not saved by this application. Portion ranges are estimates, not measured weights.

## Lab CSV format

```csv
reportDate,labName,testName,value,unit,referenceMin,referenceMax
2026-09-18,City Lab,Hemoglobin,13.3,g/dL,13,17
```

## v2 Admin and provider scheduling

### Admin
- `GET /api/admin/overview`
- `GET /api/admin/users?role=&q=`
- `PATCH /api/admin/users/:id` — activate/disable user or verify/unverify doctor
- `GET /api/admin/organizations`
- `POST /api/admin/organizations`
- `POST /api/admin/memberships` — attach a doctor to an organization, locations and services
- `POST /api/admin/schedules` — create/update doctor availability
- `GET /api/admin/appointments`
- `GET /api/admin/patient/:patientId/clinical-data?reason=` — privileged/audited clinical read
- `GET /api/admin/audits`

### Provider directory and appointment availability
- `GET /api/appointments/directory?type=&speciality=&organizationId=&doctorId=`
- `GET /api/appointments/availability?doctorId=&organizationId=&locationId=&date=YYYY-MM-DD&mode=&serviceId=`
- `POST /api/appointments` — books only a currently available generated slot
- `GET /api/appointments/mine`
- `PATCH /api/appointments/:id`
- `GET /api/appointments/schedule/mine` — doctor
- `PUT /api/appointments/schedule/:organizationId/:locationId` — doctor publishes recurring availability

## v2 Unified health reports

- `POST /api/health-reports` — create a structured report of any supported type
- `POST /api/health-reports/import-csv` — bulk import normalized metrics
- `POST /api/health-reports/extract/:recordId` — local CSV extraction or optional document-AI extraction for PDF/images
- `GET /api/health-reports/patient/:patientId?type=`
- `GET /api/health-reports/overview/:patientId` — cross-report metrics, range flags, narrative timeline and optional ML signals
