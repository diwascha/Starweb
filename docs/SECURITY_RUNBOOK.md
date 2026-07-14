# StarSutra Security & Incident Response Runbook

## 1. Security Incident Response Playbook

### Phase 1: Identification
*   **Indicators**: Unusual spikes in "System Logs" (Settings tab), multiple failed login attempts in Firebase Auth logs, or unauthorized data modifications reported by users.
*   **Action**: Review the `System Logs` in the application Settings to identify the scope (Module) and nature of the exception.

### Phase 2: Containment
*   **Compromised User**: If an account is suspected of being compromised, an Administrator must immediately go to **Settings > Users & Security** and toggle the `Approved` status to **Off**. This will block all future cloud writes for that identity.
*   **Data Isolation**: If a specific module (e.g., Payroll) is showing signs of corruption, utilize the `Payroll Lock` feature in Settings to prevent further calculation changes.

### Phase 3: Eradication
*   **Credential Reset**: Force a password change for the affected account. If the Admin account is compromised, use the `Update Master Access Key` function in Settings.
*   **Fault Isolation**: If the incident was caused by a logic error/vulnerability, the Technical Team should deploy a fix to the specific service module identified in the logs.

### Phase 4: Recovery
*   **Data Restoration**: Use the `Restore` function in **Settings** to roll back the database to the last known-good state using a `.json` backup file.
*   **Validation**: Re-enable user access and verify that security rules are enforcing the expected permissions.

---

## 2. Data Breach Response Plan
In the event of confirmed data exfiltration:
1.  **Notify Stakeholders**: Inform the lead Administrator and relevant department heads (HR, Finance).
2.  **Audit Leakage**: Review **Usage Analytics** in Settings to determine which paths were accessed and by which user IDs.
3.  **Firebase Security Rules**: Review `firestore.rules` to ensure no public access `match /{document=**} { allow read, write: if true; }` exists in the production environment.

---

## 3. Service Outage & Recovery
If the application is unreachable:
1.  **Check Cloud Health**: Verify the status of Google Cloud/Firebase services at [status.cloud.google.com](https://status.cloud.google.com).
2.  **Offline Persistence**: Note that the application has **Native Offline Persistence**. Users can continue to enter data (Trip Sheets, Expenses) while local. Writes will queue and sync automatically once connectivity is restored.
3.  **Local Backup**: Encourage regular weekly downloads of data via the `Backup Data` button in the Sidebar to ensure a local copy is always available.

---

## 4. Credential Rotation Policy
*   **Administrator Password**: Should be rotated every 90 days or whenever an administrative staff member leaves the organization.
*   **Firebase API Keys**: If the `src/firebase/config.ts` file is accidentally exposed in a public repository, the keys must be rotated in the Google Cloud Console and the application configuration updated.

---

## 5. Regular Audit Schedule
*   **Weekly**: Review "System Logs" for recurring 'error' level events.
*   **Monthly**: Perform a full "Backup" before running the "Hourly Calculation Logic" for Payroll.
*   **Quarterly**: Audit the "User Directory" and remove access for any inactive personnel.
