# CSS Migration Guide

This document outlines the process for migrating components from using Tailwind CSS to CSS Modules with global CSS variables.

## Migration Process

1.  **Identify Component:**
    *   Start by identifying the React component (e.g., `[ComponentName].tsx`) that needs to be migrated.

2.  **Analyze Existing Styles:**
    *   Carefully examine the component's JSX to understand how Tailwind CSS classes are used for styling, layout, and responsiveness.
    *   Pay close attention to layout structures (e.g., `grid`, `flex`), responsive prefixes (e.g., `md:`, `lg:`), and color usage.

3.  **Consult Global Styles:**
    *   Thoroughly review `src/globals.css`.
    *   Familiarize yourself with the available CSS variables for fonts, colors, spacing, typography, and borders (e.g., `--color-primary`, `--font-primary`, `--space-md`).

4.  **Create CSS Module:**
    *   Create a new CSS module file named `[ComponentName].module.css` in the same directory as the component.

5.  **Translate Styles to CSS Module:**
    *   In the new `[ComponentName].module.css` file, create CSS classes that correspond to the component's structure (e.g., `.container`, `.form`, `.button`).
    *   **Crucially**, replace all hardcoded values and Tailwind utilities with the appropriate CSS variables from `src/globals.css`. For example, `background-color: #1e40af;` becomes `background-color: var(--color-primary);`.
    *   Use **logical properties** for layout and spacing to ensure proper RTL/LTR support (e.g., use `margin-inline-start` instead of `margin-left`, `padding-block-end` instead of `padding-bottom`).
    *   **Preserve Layout:** Replicate the existing layout structure (e.g., two-column grid) and its responsive behavior. Use media queries if necessary to match the original design at different breakpoints.

6.  **Update Component JSX:**
    *   Remove all Tailwind CSS classes from the component's JSX.
    *   Apply the new CSS Module classes using `className={styles.yourClassName}`.
    *   For elements that require multiple styles, apply them as `className={`${styles.classA} ${styles.classB}`}`. Avoid using the `composes` property in CSS.

7.  **Delete Old CSS (If Applicable):**
    *   If the migration replaces a standalone CSS file, delete the old file.

8.  **Review and Confirm:**
    *   Present the full contents of both the new `[ComponentName].module.css` file and the modified `[ComponentName].tsx` file for user review.
    *   Do not write the files until you receive explicit approval (e.g., "Approve").

9.  **Apply Changes:**
    *   Once approved, use the appropriate tools to write the contents to `src/components/[ComponentName].module.css` and update `src/components/[ComponentName].tsx`.

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
