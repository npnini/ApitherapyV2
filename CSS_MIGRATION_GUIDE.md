# CSS Migration Guide: From Tailwind to CSS Modules

This guide details the standard process for migrating a React component from using Tailwind CSS classes to using CSS Modules with global CSS variables. This ensures consistency, maintainability, and adherence to the project's styling and RTL/LTR support rules.

## Migration Process

Follow these steps for each component being migrated:

1.  **Seek Permission:** Before starting, you must ask for and receive explicit permission to migrate a specific component (e.g., "May I migrate the `[ComponentName]` component?"). This is a critical step outlined in `airules.md`.

2.  **Analyze Component & Styles:**
    *   Read the component's `.tsx` file (e.g., `src/components/[ComponentName].tsx`).
    *   Identify all `className` attributes using Tailwind CSS utility classes.

3.  **Consult Global Styles:**
    *   Thoroughly review `src/globals.css`.
    *   Familiarize yourself with the available CSS variables for fonts, colors, spacing, typography, and borders (e.g., `--color-primary`, `--font-primary`, `--space-md`).

4.  **Create CSS Module:**
    *   Create a new CSS module file named `[ComponentName].module.css` in the same directory as the component.

5.  **Translate Styles to CSS Module:**
    *   In the new `[ComponentName].module.css` file, create CSS classes that correspond to the component's structure (e.g., `.container`, `.form`, `.button`).
    *   **Crucially**, replace all hardcoded values and Tailwind utilities with the appropriate CSS variables from `src/globals.css`. For example, `background-color: #1e40af;` becomes `background-color: var(--color-primary);`.
    *   Use **logical properties** for layout and spacing to ensure proper RTL/LTR support (e.g., use `margin-inline-start` instead of `margin-left`, `padding-block-end` instead of `padding-bottom`).

6.  **Refactor the React Component:**
    *   Open the component's `.tsx` file.
    *   Import the newly created CSS module at the top: `import styles from './[ComponentName].module.css';`.
    *   Replace all Tailwind `className` strings with the corresponding CSS module classes. For example, `className="flex items-center..."` becomes `className={styles.container}`.
    *   For conditional classes, use template literals: `className={`${styles.input} ${errors.nickname ? styles.inputError : ''}`}``.

7.  **Verify No Tailwind Classes Remain:**
    *   After refactoring the component, meticulously scan the `.tsx` file to confirm that all Tailwind utility classes have been removed from `className` attributes. The component should exclusively use classes from the imported CSS module (e.g., `className={styles.container}`).

8.  **Review and Confirm:**
    *   Present the full contents of both the new `[ComponentName].module.css` file and the modified `[ComponentName].tsx` file for user review.
    *   Do not write the files until you receive explicit approval (e.g., "Approve").

9.  **Apply Changes:**
    *   Once approved, use the appropriate tools to write the contents to `src/components/[ComponentName].module.css` and update `src/components/[ComponentName].tsx`.

## Button Styling Conventions

To ensure a consistent user experience, all buttons that trigger the creation of a new entity (e.g., "Add New Patient", "Add New Point") or a primary action (e.g., "Start") MUST use the primary action color.

*   **Primary Action / "Add New" Buttons:** These buttons must use `var(--color-primary)` for their background color and `var(--color-white)` for the text color.
