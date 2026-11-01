# MedVault v2 Upgrade Summary

The v2 upgrade adds four interview-level architectural capabilities:

1. **Super-admin control plane** — user management, doctor verification, organization creation, provider onboarding, appointment oversight, privileged clinical review and audit logs.
2. **Multi-provider scheduling** — hospitals, clinics and private practices share one organization/location/membership/service/schedule model. Patients book only server-generated available slots.
3. **Unified report intelligence** — a generalized HealthReport model supports numeric trends and narrative timelines across blood/lab, urine, vitals, radiology, pathology, ECG, echo, discharge, vaccination and other reports.
4. **Document-AI + ML services** — local PDF/image text extraction/OCR feeds structured report data; a separate ML service provides exploratory trends, forecasting and anomaly detection for longitudinal numeric series.

## Demo credentials

- Patient: `patient@demo.com` / `Demo@123`
- Doctor: `doctor@demo.com` / `Demo@123`
- Admin: `admin@demo.com` / `Demo@123`

## Important design position

The project demonstrates broad administrative capability, but health information is not treated like ordinary application data. Clinical admin reads are permission-gated and audited; QR codes contain no medical data; doctor access is consent-controlled; AI output is explicitly decision-support only.
