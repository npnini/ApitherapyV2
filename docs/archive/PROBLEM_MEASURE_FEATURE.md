# Feature: Problem and Measure Tracking

This document outlines the development plan for implementing the problem and measure tracking functionality.

## 1. Feature Overview

The goal is to build a new layer into the system for tracking patient problems and their progress over time. This will create a clear structure for evidence-based treatment.

### Core Entities:

*   **Problem:** A new entity representing a specific medical issue (e.g., "Chronic Migraines," "Lower Back Pain").
*   **Measure:** A new entity that defines how a `Problem` is measured (e.g., a 1-10 pain scale, frequency per week, a quality-of-life survey score).

### Relationships:

*   A `Patient` can be associated with one or more `Problems`.
*   A `Problem` will have one or more associated `Measures` to track its status.
*   A `Treatment` will be linked to a `Problem`, allowing the selected `Measures` to reflect the treatment's effectiveness.

## 2. Development Plan

1.  **Data Modeling:** Define the TypeScript types and Firestore collections for `Problem` and `Measure`.
2.  **Admin Interface:** Create new admin components to allow caretakers to Create, Read, Update, and Delete (CRUD) `Problems` and their associated `Measures`.
3.  **Patient Integration:** Update the `Patient` view to display their associated `Problems`.
4.  **Treatment Integration:** Connect the `Treatment` entity to a `Problem` to enable progress tracking against the defined `Measures`.

## 3. Use Case: Measure Configuration

This use case describes the scenario for managing `Measures` within the system.

*   **Actor:** Admin user.
*   **Trigger:** The admin user navigates to a new "Measure Configuration" screen under the "Configuration" section of the application.

### Flow:

1.  The admin user enters the "Measure Configuration" scenario.
2.  The system displays a list of all currently defined `Measures`.
3.  The admin can perform the following actions:
    *   **Add a new Measure:**
        *   The admin provides a unique `name` and a `description`.
        *   The admin selects a `type`: "Category" or "Scale".
        *   If "Category" is selected, the admin can define multiple textual values (e.g., "Mild", "Moderate", "Severe").
        *   If "Scale" is selected, the admin defines a `minimum` and `maximum` range (e.g., 1 to 10).
    *   **Modify an existing Measure:**
        *   The admin can edit the `name`, `description`, `type`, and the type-specific values (categories or scale range).
        *   The `name` must remain unique.
    *   **Delete a Measure:**
        *   The admin can delete a `Measure` only if it is not currently associated with any `Problem`.
