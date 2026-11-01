# Admin and Security Model

## Roles

- **Patient**: owns records, controls doctor access, books appointments and views personal analytics.
- **Doctor**: can access a patient only with an active consent grant (or an audited emergency path), issue prescriptions, manage appointments and publish availability.
- **Admin**: platform/provider operations. Fine-grained permissions are stored in `adminProfile.permissions`.

## Demo admin permissions

- `user_admin`
- `provider_admin`
- `appointment_admin`
- `compliance_read`
- `clinical_data_read`

This satisfies the demo requirement for an admin who can inspect users, doctors, patients, provider organizations, appointments, audit logs and clinical data. However, unrestricted health-data access should **not** be the default for every production administrator. Clinical access is deliberately a separate permission and every use is written to the audit log.

## Production hardening roadmap

- MFA/passkeys for doctors and admins.
- Short-lived access tokens + refresh-token rotation.
- Field/file encryption using a KMS/HSM rather than only disk/database encryption.
- Object storage with pre-signed URLs and malware scanning.
- Immutable/WORM audit storage and SIEM export.
- Patient consent scope by data category and purpose.
- Tenant isolation for hospital enterprise customers.
- Doctor credential-verification workflow.
- Data retention/deletion policy and legal/compliance controls appropriate to the deployment country.
- Rate limiting, CSRF strategy where cookies are used, secret rotation, dependency scanning and SAST/DAST.
