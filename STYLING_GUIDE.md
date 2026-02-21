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

## Input Field UX & Labeling

To provide clear visual cues for mandatory fields and multilingual support, all input fields must follow these labeling conventions:

*   **Label Structure:**
    *   **Required Asterisk (`*`):** If a field is mandatory, a red asterisk must follow the label text.
    *   **Multilingual Globe (`🌐` icon):** If a field supports multiple languages, a globe indicator (Lucide `Globe` icon) must be displayed.
    *   **Translation Counter (`x/n`):** Multilingual fields must show a counter indicating how many languages have been filled out of the total supported languages (e.g., "1/2").

*   **Multilingual Placeholder Logic:**
    *   When editing a field in a non-default language, the placeholder should display the current value of that field in the **Default Language**. This helps the editor maintain consistency across translations.
    *   If the default language value is empty, use a standard localized placeholder.

## Translation Reference Box (Styled Reference Fields)

When editing a multilingual form in a non-default language, a styled reference box may appear above the input field showing the content from the default language for reference.

*   **Purpose:** Helps translators see the source text they need to translate, without making it editable.
*   **Appearance:** Light blue background (`var(--color-info-background)` or equivalent) with a thick left accent border, clearly marking it as read-only reference data.
*   **Visibility Rule — When to Show:**
    *   The reference box must **only** appear when **both** of the following conditions are true:
        1.  The user is editing a **non-default language** tab.
        2.  The field for the **current active language has no value yet** (i.e., the translation is missing).
    *   Once the user has entered a translation for the active language, the reference box must **disappear** — it is no longer needed.
    *   The condition in code must be: `activeLang !== defaultLanguage && !fieldValue[activeLang]`
*   **Rationale:** The reference box is a guidance tool, not a persistent display. Showing it when a translation already exists adds visual clutter and noise. It should only appear when it serves a purpose: guiding the user to fill in a missing translation.

## Language Tab Ordering in Edit Forms

When a multilingual edit form displays language selection tabs, the tabs must follow this ordering rule:

*   **First tab:** The user's current UI language (`i18n.language` / `currentLang`) — always pinned to the leading position (left for LTR languages, right for RTL languages).
*   **Remaining tabs:** All other supported languages sorted **ascending by language code** (alphabetical order).
*   **Exclusion:** If the user's language is not in the supported list, it must be excluded (filter to only include languages that are actually supported).

**Implementation pattern:**
```ts
const orderedLangs = [currentLang, ...SUPPORTED_LANGS.filter(l => l !== currentLang).sort()]
    .filter(l => SUPPORTED_LANGS.includes(l));
```

**Rationale:** Placing the user's own language first minimizes the distance to the most relevant tab, giving translators/admins immediate access to the language they work in most. The remaining tabs are sorted deterministically to avoid confusion from arbitrary ordering.

