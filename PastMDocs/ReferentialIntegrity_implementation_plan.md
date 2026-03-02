# Implementation Plan: Referential Integrity Mechanism

Add referential integrity and status management to core configuration entities (Points, Protocols, Measures, Problems) to prevent accidental deletion and control visibility.

## User Review Required

> [!IMPORTANT]
> **Reference Calculation during Migration**: I strongly recommend that the migration script calculates the actual current `reference_count` for points, protocols, and measures by scanning existing data, rather than just setting them all to 0. This ensures that items already in use are immediately protected from deletion.

> [!NOTE]
> **Active/Inactive Logic**: If a document is set to `inactive`, it will be hidden from *future* selections in `ProtocolAdmin` and `ProblemAdmin`. Existing references will remain intact.

> [!CAUTION]
> **Temporary Rules Relaxation**: To run the migration script, we must temporarily allow public read/write access to the `cfg_` collections or authenticate the script. I recommend a temporary rule change to `allow read, write: if true;` for specific collections during the migration window.

## Proposed Changes

### [Component Name] Data Layer & Migration

#### [NEW] [migrate_referential_integrity.js](file:///c:/Users/User/Dev/Projects/ApitherapyV2/scripts/migrate_referential_integrity.js)
- A Node.js script to:
  - Add `status: 'active'` to all docs in `cfg_acupuncture_points`, `cfg_protocols`, `cfg_measures`, `cfg_problems`.
  - Calculate `reference_count` for points (by counting their occurrences in `cfg_protocols`).
  - Calculate `reference_count` for protocols and measures (by counting their occurrences in `cfg_problems`).
  - Update all docs in Firestore.

---

### Points Admin

#### [MODIFY] [PointsAdmin.tsx](file:///c:/Users/User/Dev/Projects/ApitherapyV2/src/components/PointsAdmin.tsx)
- Add `status` (active/inactive) toggle to the **edit form only**.
- Delete button logic in list:
  - If `reference_count === 0`: Enabled (Red).
  - If `reference_count > 0`: Disabled (Greyed out) + Tooltip explaining why.
- Ensure new points are created with `status: 'active'` and `reference_count: 0`.

---

### Protocol Admin

#### [MODIFY] [ProtocolAdmin.tsx](file:///c:/Users/User/Dev/Projects/ApitherapyV2/src/components/ProtocolAdmin.tsx)
- Add `status` (active/inactive) toggle to the **edit form only**. 
- Delete button logic in list:
  - If `reference_count === 0`: Enabled (Red).
  - If `reference_count > 0`: Disabled (Greyed out) + Tooltip explaining why.
- **Selection Filtering**: In the point selection list, only show points with `status: 'active'`.
- **Reference Management**: On `handleSave`, compare the previous points with the new points:
  - Use Firestore `increment(1)` for newly added point IDs.
  - Use Firestore `increment(-1)` for removed point IDs.

---

### Measure Admin

#### [MODIFY] [MeasureAdmin.tsx](file:///c:/Users/User/Dev/Projects/ApitherapyV2/src/components/MeasureAdmin/MeasureAdmin.tsx)
- Add `status` (active/inactive) toggle to the **edit form only**.
- Delete button logic in list:
  - If `reference_count === 0`: Enabled (Red).
  - If `reference_count > 0`: Disabled (Greyed out) + Tooltip explaining why.

---

### Problem Admin

#### [MODIFY] [ProblemForm.tsx](file:///c:/Users/User/Dev/Projects/ApitherapyV2/src/components/ProblemAdmin/ProblemForm.tsx)
- **Selection Filtering**: Filter `availableProtocolsForShuttle` and `availableMeasuresForShuttle` to only include `status === 'active'` items.
- Ensure already selected items remain visible (and selectable for removal) even if they are inactive.

#### [MODIFY] [ProblemAdmin.tsx](file:///c:/Users/User/Dev/Projects/ApitherapyV2/src/components/ProblemAdmin/ProblemAdmin.tsx)
- Add `status` (active/inactive) toggle to the **edit form only**.
- Delete button logic in list:
  - If `reference_count === 0`: Enabled (Red).
  - If `reference_count > 0`: Disabled (Greyed out) + Tooltip explaining why.
- **Reference Management**: On `handleSubmit`, compare previous protocol/measure IDs with new ones and update `reference_count` using `increment()`.

## Verification Plan

### Automated Tests
- Run the migration script and verify Firestore values in the Firebase Console.
- Manual verification of UI states.

### Manual Verification
1. **Migration Verification**: Check random docs in `cfg_protocols` etc., to see if `reference_count` is correctly calculated.
2. **Deletion Protection**: Attempt to delete a point used by a protocol; the button should be disabled.
3. **Status Toggle**: Set a point to `inactive` and verify it disappears from the selection list in `ProtocolAdmin` for *new* protocols.
4. **Selection Sync**:
   - Add a point to a protocol and verify the point's `reference_count` increases.
   - Remove a point and verify it decreases.
