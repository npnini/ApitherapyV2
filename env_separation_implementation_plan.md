# Environment Separation & Deployment Strategy

This plan outlines the transition of "ApitherapyV2" from a single-project setup to a professional, multi-environment architecture.

## 1. Environment Strategy: 3-Tier Model
For a clinical application like Apitherapy, I strongly recommend a **3-environment** setup.

- **Development (`apitherapy-dev`)**: Where developers experiment. Contains "garbage" data and testing users.
- **Staging (`apitherapy-stage`)**: A mirror of Production. Used for final QA, testing release scripts, and showing the app to stakeholders. **Critical rule:** No experimental features allowed here; only release candidates.
- **Production (`apitherapy`)**: The live environment for real patients and clinical staff. Total data isolation.

---

## 2. Architectural Description

### Firebase Project Isolation
Each environment is a **completely separate Firebase Project**. This ensures:
- **Authentication**: A patient registered in Dev cannot log into Prod.
- **Firestore**: You can test new data structures in Dev without breaking the live app.
- **Storage**: Personal clinical documents (PNGs) are kept strictly in the production bucket.
- **Billing**: Separation of costs for development vs. production.

### Configuration Management
We will use **Vite Environment Variables** and **Firebase CLI Project Aliases**.
- `.env.development`: Points to `apitherapy-dev`
- `.env.staging`: Points to `apitherapy-stage`
- `.env.production`: Points to `apitherapy`

### Data Analytics (BigQuery)
Each environment will have its own dataset.
- `apitherapy_clinical_analytics_dev`: For local emulator testing and developer experimentation.
- `apitherapy_clinical_analytics_stage`: For QA and stakeholder reporting, populated from the staging Firestore.

---

## 3. Immediate Action Items (Task Tree)

### [ ] Infrastructure: BigQuery Staging Setup
- **Create Dataset**: Create the `apitherapy_clinical_analytics_stage` dataset in BigQuery.
  - *Explanation*: We need a dedicated home for staging data that is separate from your current dev testing.
- **Data Backfill (Cloud -> Staging BQ)**: Run the Firestore-to-BigQuery import script to populate the new staging dataset with all current cloud data.
  - *Explanation*: The extension only syncs *new* changes. To get your existing history into the new dataset, we must run a one-time "Backfill" command.
- **Create Views**: Re-create the SQL Views (e.g., `view_treatment_effectiveness`) in the new staging dataset.

### [ ] Local Development: Emulator & Syncing
- **Enable Pub/Sub Emulator**: Ensure `pubsub` is in `firebase.json` (Done).
- **Run Sync Script**: Execute `npm run sync-data` to pull the latest Cloud Firestore and Storage data into the local emulator.
- **Verify Data**: Check the Emulator UI (port 4000) to confirm documents and files are present.
- **Verify BQ Redirection**: Confirm that functions running in the emulator use the `..._dev` dataset while deployed functions use `..._stage`.

### [ ] Extension Management: Local Overrides
- **Export Config**: Run `firebase ext:export` to bring extension settings into the project tree.
- **Setup .env.local**: Create `extensions/firestore-bigquery-export.env.local` to override the `DATASET_ID` for local testing.
  - *Explanation*: This ensures that when you run emulators, the extension "thinks" its target is the dev dataset, even if the cloud instance points to staging.

---

## 4. Release Process (Code Promotion)

1. **Development**: 
   - Work happens on `feature/` branches.
   - Deployed manually or via CI to `apitherapy-dev` for verification.
2. **Staging (Release Candidate)**:
   - Merge `feature` into `develop` branch.
   - **GitHub Action** automatically builds and deploys to `apitherapy-stage`.
   - Perform final "Smoke Tests" here.
3. **Production (Live)**:
   - Merge `develop` into `main`.
   - **GitHub Action** builds and deploys to `apitherapy`.
   - Tags the release in Git (e.g., `v2.0.1`).

---

## Phased Implementation Checklist

### Phase 1: Infrastructure Setup
- [ ] **Create Staging Project**: Create `apitherapy-stage` in the Firebase Console.
- [ ] **Provision Databases**: Initialize Firestore (Native Mode) in both `apitherapy` and `apitherapy-stage`.
- [ ] **Enable Services**: Enable Storage and Authentication in all 3 projects.

### Phase 2: Local Environment Configuration
- [ ] **Setup Aliases**: Run `firebase use --add` to map `default` to dev, and add `stage` and `prod` aliases.
- [ ] **Create Env Files**: Create `.env.staging` and `.env.production`.

---

## Open Questions

> [!IMPORTANT]
> 1. **Backfill Authentication**: To run the BigQuery import script, you will need a service account key with BigQuery Data Editor permissions. Do you have one, or should I help you create a temporary one?
