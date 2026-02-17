# CSS Styling Guide

## Input and Textarea Styling Conventions

*   **Standard Inputs (`input`, `select`):**
    *   **Styling:** Must have a `background-color` of `var(--color-background-input)` and a `border` of `1px solid var(--color-border)`.

*   **Textareas:**
    *   **Styling:** In addition to the standard input styles, textareas must be vertically resizable (`resize: vertical;`) to accommodate long-form text.

## Button Styling Conventions

To ensure a consistent user experience, adhere to the following button styling rules:

*   **Primary Action Buttons:**
    *   **Use Case:** For primary actions like "Save Changes", "Submit", or creating new entities (e.g., "Add New Patient").
    *   **Styling:** Must use `var(--color-primary)` for the background and `var(--color-white)` for the text.

*   **Secondary Action Buttons:**
    *   **Use Case:** For secondary actions like "Cancel" or "Back".
    *   **Styling:** Must use a neutral grey. Use `var(--color-secondary-button-background)` for the background and `var(--color-text-secondary)` for the text.

## Edit Form Headers

All edit forms, especially those presented in modals, must include a standardized header bar.

*   **Purpose:** Provides a clear title for the form and an easy way to close it.
*   **Header Bar Styling:**
    *   **Layout:** Must use `display: flex` with `justify-content: space-between` and `align-items: center`.
    *   **Colors:** The background must be `var(--color-primary)` and the text/icons must be `var(--color-white)`.
    *   **Padding:** Must have consistent padding (e.g., `1rem 1.5rem`).
*   **Close Button:**
    *   An "X" icon button must be placed on the right side.
    *   It should have no background or border to appear integrated into the header.
