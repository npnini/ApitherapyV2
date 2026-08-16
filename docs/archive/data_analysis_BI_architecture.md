# Data Analysis & Business Intelligence (BI) Proposal

To provide superadmins and advanced users with the true freedom to execute ad-hoc analysis, pivot tables, and custom reporting, a custom React dashboard is often too limiting. 

Instead, we should implement a modern **Data Warehousing & BI Architecture**. This allows the real-time operational database (Firestore) to synchronize with an analytical database (like BigQuery), which can then be connected to a powerful BI tool (like Looker or Power BI) where users can drag, drop, and filter data freely.

## Proposed Technical Architecture

### 1. Data Synchronization (The ELT Pipeline) - Anonymized Export
Firestore is a NoSQL, document-based operational database. It is incredibly fast for looking up a single patient's history, but it is not built for complex, cross-collection analytical queries.

**The Solution:** Use the official Firebase Extension: **Stream Firestore to BigQuery**.
*   **Medical Privacy First (HIPAA/GDPR Compliant):** When configuring this extension for the `patients` collection, we explicitly **exclude** all Personally Identifiable Information (PII) like `fullName`, `address`, `email`, `mobile`, and `identityNumber`.
*   **What Gets Exported:** Only the highly anonymized patient document ID (e.g., `0FuMqiG...`), their `birthDate`, `gender`, and their assigned `caretakerId` are streamed to BigQuery. This ensures that the BI analyst cannot connect the medical outcomes back to a real-world individual.
*   **Cost:** Extremely low for the volume of data we have generated.

### 2. Data Transformation (SQL Views)
Once the raw JSON documents are in BigQuery, we create **SQL Views** to "flatten" and join the data into business-ready tables.
*   **Example View 1: "Treatment Outcomes Master"**: Joins the `treatments` table with the `patients` demographic info and the `measured_values` array, flattening the `rounds` (number of stings) into a single column.
*   **Example View 2: "Vital Signs Fact Table"**: A time-series log of all pre, intra, and post-treatment blood pressure and heart rate readings linked to protocol names.

### 3. The Business Intelligence (BI) Layer
We connect the clean BigQuery views directly to a BI tool. This empowers the end-user (e.g., the clinic director or researcher) to ask new questions without needing a developer to write code.

**Recommended BI Tools:**

*   **Google Looker Studio (Free, Highly Recommended):** 
    *   **Pros:** Natively integrates with BigQuery in two clicks. Free to use. Extremely easy to share dashboards securely. Allows end-users to apply dynamic date filters, caretaker filters, and drag/drop dimensions to create new pivots.
    *   **Cons:** Not as deeply programmatic as Power BI for complex statistical modeling.

*   **Microsoft Power BI (Enterprise Standard):**
    *   **Pros:** Phenomenal data modeling capabilities (DAX). Deep integration if the clinic uses Office 365. Exceptional interactivity.
    *   **Cons:** Requires a Pro license ($10/mo per user) to share dashboards securely. Connecting to BigQuery requires setting up the native connector or ODBC.

*   **Tableau or Metabase:** Other excellent alternatives depending on existing licensing or open-source preferences (Metabase is great for self-hosting).

---

## What the End-User Can Do in the BI Tool (Freedom to Explore)

Once connected, the user is presented with a blank canvas and a list of "Fields" on the right side of their screen (e.g., `Patient Age Group`, `Total Stings`, `Protocol Name`, `Pre-Treatment Pain Scale`, `Post-Treatment Pain Scale`).

They can freely create the following insights (and thousands more) on the fly:

1.  **Drop 'Protocol Name' into rows and 'Average Pain Reduction' into columns** to instantly see which protocol performs best.
2.  **Add a 'Caretaker' filter dropdown** to the top of the report to see those protocol metrics for just one specific therapist.
3.  **Drag 'Patient Age Group' into a pie chart** to see the demographic breakdown of patients who received Treatment X yesterday.
4.  **Create a Scatter Plot** mapping the `Heart Rate Delta` (post - pre) against the `Total Stings` to look for safety correlations.
5.  **Build a Pivot Table** filtering only female patients over 50 with Migraines, mapping their average sleep quality improvement week over week.

By decoupling the analytical engine from the operational application, you give the medical and administrative team complete data sovereignty to find insights we haven't even thought of yet.
