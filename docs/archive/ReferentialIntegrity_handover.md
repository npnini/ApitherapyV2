# Handover: Referential Integrity Mechanism

## Status: In Progress 
**Phase**: Setup & Planning (Branch: `feature/ReferentialIntegrity`)

## Goal
Implement a referential integrity mechanism to prevent deletion of in-use configuration entities (Points, Protocols, Measures, Problems) and add status management (Active/Inactive).

## Completed
- [x] Initial Planning & Specs analysis.
- [x] Implementation plan approved by user.
- [x] Created feature branch `feature/ReferentialIntegrity`.
- [x] Moved implementation plan to `PastMDocs/ReferentialIntegrity_implementation_plan.md`.

## Next Steps
- [ ] Implement Migration Script (`scripts/migrate_referential_integrity.js`).
- [ ] Execute Migration and Validate.
- [ ] Update Admin Components (Points, Protocol, Measure, Problem).
- [ ] Implement `increment/decrement` logic for `reference_count`.

## Key Files
- [ReferentialIntegrity_implementation_plan.md](file:///c:/Users/User/Dev/Projects/ApitherapyV2/PastMDocs/ReferentialIntegrity_implementation_plan.md)
- `src/components/PointsAdmin.tsx`
- `src/components/ProtocolAdmin.tsx`
- `src/components/MeasureAdmin/MeasureAdmin.tsx`
- `src/components/ProblemAdmin/ProblemAdmin.tsx`
- `src/components/ProblemAdmin/ProblemForm.tsx`
