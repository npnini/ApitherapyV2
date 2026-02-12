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
