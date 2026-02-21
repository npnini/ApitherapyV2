Session Handover: Multilingual Implementation
🚨 MANDATORY STARTUP INSTRUCTIONS
we are in Phase 1 of the implementation plan.
The next agent MUST read the following files in order before taking any action. No implementation work may begin without completing all four steps.

airules.md
 — Project constraints, rules, and handover duties.
STYLING_GUIDE.md
 — CSS and coding conventions. All new UI must follow these standards.
handover.md
 — This document. Provides current status, completed milestones, and the immediate next step.

Phase 1 implementation guide.md
 — The active technical blueprint. Defines every file to modify, what to change, and how. This is the single source of truth for what to build. MANDATORY before writing any code.
Current Status: Ready for Phase 1 Execution
Planning Phase 1 is complete and fully approved. The user and agent agreed on a unified map-based data structure to replace legacy string-based fields across all clinical entities.

Key Strategy
Phase 1 (Human-Authored): Admin manually enters translations for clinical terms (Problems, Protocols, Points, Measures, Questionnaires) via updated Admin UIs.
Phase 1 Data Pattern: { [lang_code]: string } (e.g., { en: "Name", he: "שם" }).
Phase 2 (Automated): UI "Chrome" (buttons, labels) will be translated on-the-fly via Google Translate API and cached in Firestore.
Goal: Full elimination of static translation.json files.
Completed Milestones
 Phase 1 technical approach finalized and approved.
 
implementation_plan.md
 written and reviewed.
 
do not read unless instructed in Phase 2i18n-to-live-translation-migration.md
 (Phase 2 guide) written.
 
airules.md
 updated to enforce reading 
implementation_plan.md
 at session start.
Immediate Next Steps (Execution Order)
Types first (measure.ts, problem.ts, apipuncture.ts, protocol.ts, questionnaire.ts) — Change string fields to { [key: string]: string } maps.
MeasureAdmin.tsx / EditMeasureForm — Add language toggle, update category editor.
ProblemForm.tsx — Add language selector for name and description.
QuestionnaireForm.tsx — Add text/select types and multilingual Options Editor.
PointsAdmin.tsx — Transition label and description.
ProtocolAdmin.tsx — Transition name, description, rationale.
Patient UI — Update display logic to pick the correct language string via i18n.language.
Contextual Notes
The user prefers a component-by-component approach: implement one entity fully, then get confirmation before moving to the next.
The type field in Questionnaires needs a special Options Editor for localized dropdown values.
Do NOT modify translation.json — list new keys for the user to add manually.
Do NOT build or deploy.
Current conversation ID: 4c9032fe-ee48-4df0-aa38-83f0b4ee2368