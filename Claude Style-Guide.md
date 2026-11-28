# **CSS Styling Guide**

## **Core Design Principles**

This guide ensures a consistent, professional, and user-friendly interface across all forms in the application. The design prioritizes clarity and usability while maintaining a clean, medical-grade professional appearance.

---

## **Color System**

### **Base Colors**

The tokens live in **`src/index.css`**, the single source of truth (palette "D · Navy & Tints", docs/Future/UI-Redesign-Plan.md). Never hard-code a colour that a token covers; use the role tokens below so a palette change touches only `index.css`.

**Colour roles:**

* **Teal** (`--color-primary`) is the action colour: primary buttons, links, focus rings, progress.  
* **Navy** (`--color-navy`) is for headings and the current sidebar item.  
* **Bright blue** (`--color-selected`) marks what is selected: the active tab, step, toggle or filter pill. It is also used for table header rows and window header bars.  
* **Honey** (`--color-honey`) is the brand accent, used sparingly: the logo mark and the avatar only.  
* **Red, orange and green** are reserved for error, warning and success. Never use them as decoration.  
* **Soft tints** (light background, dark text) are for chips and value tiles, and only where the data has a real category or status.

:root {  
  /\* Brand \*/  
  \--color-navy: \#1e2a5a; /\* Headings, selected states \*/  
  \--color-navy-hover: \#16204a;  
  \--color-navy-light: \#e8ebf7; /\* Navy tint: hover, current item, value tiles \*/  
  \--color-honey: \#f2b705; /\* Logo mark, avatar \*/  
  \--color-honey-ink: \#7a4b00; /\* Text on honey \*/  
    
  /\* Primary (action colour) \*/  
  \--color-primary: \#0b7a6e; /\* Teal; white text on it meets WCAG AA \*/  
  \--color-primary-hover: \#09655b;  
  \--color-primary-light: \#dff3ef;  
  \--color-primary-rgb: 11, 122, 110; /\* For rgba usage: rgba(var(--color-primary-rgb), 0.1) \*/  
    
  /\* Roles \*/  
  \--color-heading: var(--color-navy);  
  \--color-selected: \#2f6bd8; /\* Active tab / step / toggle / filter pill, table header rows; white text meets AA \*/  
  \--color-selected-hover: \#2659bd;  
  \--color-selected-rgb: 47, 107, 216;  
  \--color-selected-text: var(--color-white);  
  \--modal-header-background: var(--color-selected); /\* Window header bar \*/  
  \--modal-header-text: var(--color-white);  
  \--modal-header-border: var(--color-selected);  
  \--modal-header-button-hover: rgba(255, 255, 255, 0.16);  
  \--modal-header-icon-background: rgba(255, 255, 255, 0.16);  
    
  /\* Backgrounds \*/  
  \--color-background-page: \#f5f7fb; /\* Cool off-white page background \*/  
  \--color-background-card: \#ffffff; /\* White for cards/containers \*/  
  \--color-background-input: \#ffffff; /\* White for input fields \*/  
  \--color-background-input-hover: \#f6f8fc; /\* Subtle hover state \*/  
  \--color-background-input-disabled: \#eef1f6; /\* Disabled inputs \*/  
  \--color-background-muted: \#eef1f7; /\* Quiet panels \*/  
    
  /\* Borders \*/  
  \--color-border: \#d5dbea; /\* Default borders \*/  
  \--color-border-light: \#e5e9f3; /\* Subtle dividers \*/  
  \--color-border-hover: \#a3abc4; /\* Hover state \*/  
  \--color-border-focus: var(--color-primary); /\* Focus state \*/  
    
  /\* Text \*/  
  \--color-text-primary: \#1b2340; /\* Main text \*/  
  \--color-text-secondary: \#5d6784; /\* Secondary text \*/  
  \--color-text-tertiary: \#8f97b0; /\* Placeholders \*/  
  \--color-white: \#ffffff;  
    
  /\* Semantic Colors \*/  
  \--color-error: \#dc2626;  
  \--color-error-background: \#fef2f2;  
  \--color-success: \#16a34a;  
  \--color-success-background: \#f0fdf4;  
  \--color-warning: \#ea580c;  
  \--color-warning-background: \#fff7ed;  
  \--color-info-background: \#eef1fa; /\* Light navy for reference boxes \*/  
    
  /\* Button Colors \*/  
  \--color-secondary-button-background: \#eef1f6;  
  \--color-secondary-button-hover: \#e3e8f1;  
    
  /\* Shadows (navy-tinted, soft and layered) \*/  
  \--shadow-sm: 0 1px 2px 0 rgba(27, 35, 64, 0.06);  
  \--shadow-card: 0 1px 2px rgba(27, 35, 64, 0.05), 0 4px 14px \-6px rgba(27, 35, 64, 0.12);  
  \--shadow-input-focus: 0 0 0 3px rgba(var(--color-primary-rgb), 0.15);  
  \--shadow-modal: 0 20px 25px \-5px rgba(27, 35, 64, 0.14);  
    
  /\* Spacing \*/  
  \--spacing-xs: 0.25rem; /\* 4px \*/  
  \--spacing-sm: 0.5rem; /\* 8px \*/  
  \--spacing-md: 1rem; /\* 16px \*/  
  \--spacing-lg: 1.5rem; /\* 24px \*/  
  \--spacing-xl: 2rem; /\* 32px \*/  
    
  /\* Border Radius \*/  
  \--radius-sm: 4px;  
  \--radius-md: 8px;  
  \--radius-lg: 12px;  
  \--radius-full: 9999px;  
    
  /\* Typography \*/  
  \--font-size-xs: 0.75rem; /\* 12px \*/  
  \--font-size-sm: 0.875rem; /\* 14px \*/  
  \--font-size-base: 1rem; /\* 16px \*/  
  \--font-size-lg: 1.125rem; /\* 18px \*/  
  \--font-size-xl: 1.25rem; /\* 20px \*/  
    
  \--font-weight-normal: 400;  
  \--font-weight-medium: 500;  
  \--font-weight-semibold: 600;  
  \--font-weight-bold: 700;  
}

---

## **Layout & Structure**

### **Page Layout**

.page-container {  
  background-color: var(--color-background-page);  
  min-height: 100vh;  
  padding: var(--spacing-lg);  
}

### **Form Containers (Cards)**

All form sections must be wrapped in card containers to create visual separation and hierarchy.

.form-card {  
  background: var(--color-background-card);  
  border-radius: var(--radius-lg);  
  padding: var(--spacing-lg);  
  box-shadow: var(--shadow-card);  
  margin-bottom: var(--spacing-lg);  
}

.form-card:last-child {  
  margin-bottom: 0;  
}

**Usage:** Group related fields together in form cards. Each logical section (e.g., "Personal Details", "Blood Pressure Readings", "Treatment Notes") should be its own card.

### **Section Headers**

Section headers within forms provide clear organization.

.section-header {  
  font-size: var(--font-size-lg);  
  font-weight: var(--font-weight-semibold);  
  color: var(--color-text-primary);  
  margin-bottom: var(--spacing-md);  
  padding-bottom: var(--spacing-sm);  
  border-bottom: 1px solid var(--color-border-light);  
}

/\* Alternative: Background style for sections \*/  
.section-header-alt {  
  font-size: var(--font-size-base);  
  font-weight: var(--font-weight-semibold);  
  color: var(--color-text-secondary);  
  text-transform: uppercase;  
  letter-spacing: 0.05em;  
  margin-bottom: var(--spacing-md);  
}

---

## **Input Fields & Form Controls**

### **Standard Input Styling**

All text inputs, number inputs, email inputs, and select dropdowns must follow these conventions.

input\[type="text"\],  
input\[type="email"\],  
input\[type="number"\],  
input\[type="tel"\],  
input\[type="date"\],  
input\[type="time"\],  
select {  
  width: 100%;  
  padding: 0.625rem 0.75rem; /\* 10px 12px \*/  
  font-size: var(--font-size-base);  
  font-weight: var(--font-weight-normal);  
  color: var(--color-text-primary);  
  background-color: var(--color-background-input);  
  border: 1.5px solid var(--color-border);  
  border-radius: var(--radius-md);  
  transition: all 0.2s ease;  
}

/\* Hover State \*/  
input:hover:not(:disabled),  
select:hover:not(:disabled) {  
  border-color: var(--color-border-hover);  
  background-color: var(--color-background-input-hover);  
}

/\* Focus State \*/  
input:focus,  
select:focus {  
  outline: none;  
  border-color: var(--color-border-focus);  
  box-shadow: var(--shadow-input-focus);  
  background-color: var(--color-background-input);  
}

/\* Disabled State \*/  
input:disabled,  
select:disabled {  
  background-color: var(--color-background-input-disabled);  
  color: var(--color-text-secondary);  
  cursor: not-allowed;  
  opacity: 0.6;  
}

/\* Placeholder \*/  
input::placeholder {  
  color: var(--color-text-tertiary);  
  font-weight: var(--font-weight-normal);  
}

### **Textarea Styling**

Textareas must follow the same styling as standard inputs with added vertical resize capability.

textarea {  
  width: 100%;  
  padding: 0.625rem 0.75rem;  
  font-size: var(--font-size-base);  
  font-weight: var(--font-weight-normal);  
  color: var(--color-text-primary);  
  background-color: var(--color-background-input);  
  border: 1.5px solid var(--color-border);  
  border-radius: var(--radius-md);  
  resize: vertical; /\* Allow vertical resizing only \*/  
  min-height: 100px;  
  transition: all 0.2s ease;  
  font-family: inherit;  
}

textarea:hover:not(:disabled) {  
  border-color: var(--color-border-hover);  
  background-color: var(--color-background-input-hover);  
}

textarea:focus {  
  outline: none;  
  border-color: var(--color-border-focus);  
  box-shadow: var(--shadow-input-focus);  
  background-color: var(--color-background-input);  
}

textarea::placeholder {  
  color: var(--color-text-tertiary);  
}

### **Input Field Container**

Each input field should be wrapped in a container with its label.

.input-field {  
  margin-bottom: var(--spacing-md);  
}

.input-field:last-child {  
  margin-bottom: 0;  
}

### **Input Grid Layouts**

For forms with multiple fields in a row (e.g., blood pressure readings).

.input-grid-2 {  
  display: grid;  
  grid-template-columns: repeat(2, 1fr);  
  gap: var(--spacing-md);  
}

.input-grid-3 {  
  display: grid;  
  grid-template-columns: repeat(3, 1fr);  
  gap: var(--spacing-md);  
}

.input-grid-4 {  
  display: grid;  
  grid-template-columns: repeat(4, 1fr);  
  gap: var(--spacing-md);  
}

/\* Responsive: Stack on mobile \*/  
@media (max-width: 768px) {  
  .input-grid-2,  
  .input-grid-3,  
  .input-grid-4 {  
    grid-template-columns: 1fr;  
  }  
}

---

## **Labels & Field Indicators**

### **Label Styling**

Labels must be clear, readable, and positioned above their inputs.

label {  
  display: block;  
  font-size: var(--font-size-sm);  
  font-weight: var(--font-weight-semibold);  
  color: var(--color-text-primary);  
  margin-bottom: var(--spacing-xs);  
  line-height: 1.5;  
}

### **Required Field Indicator**

Required fields must be marked with a red asterisk immediately following the label text.

.required {  
  color: var(--color-error);  
  margin-left: 2px;  
  font-weight: var(--font-weight-bold);  
}

**HTML Example:**

\<label\>  
  Patient Name \<span class="required"\>\*\</span\>  
\</label\>

### **Multilingual Field Indicators**

Fields that support multiple languages must display:

1. A globe icon (🌐 or Lucide `Globe`)  
2. A translation counter showing progress (e.g., "1/2")

.label-with-multilingual {  
  display: flex;  
  align-items: center;  
  gap: var(--spacing-xs);  
}

.multilingual-indicator {  
  display: inline-flex;  
  align-items: center;  
  gap: 4px;  
  color: var(--color-text-secondary);  
  font-size: var(--font-size-xs);  
  font-weight: var(--font-weight-normal);  
}

.multilingual-icon {  
  width: 14px;  
  height: 14px;  
}

**HTML Example:**

\<label class="label-with-multilingual"\>  
  \<span\>Description \<span class="required"\>\*\</span\>\</span\>  
  \<span class="multilingual-indicator"\>  
    \<Globe className="multilingual-icon" /\>  
    \<span\>1/2\</span\>  
  \</span\>  
\</label\>

---

## **Translation Reference Box**

When editing a multilingual form in a non-default language, a reference box may appear showing the default language content.

### **Visibility Rules**

The reference box must **only** appear when **both** conditions are true:

1. User is editing a **non-default language** tab  
2. The field for the **current active language is empty** (translation missing)

**Condition:** `activeLang !== defaultLanguage && !fieldValue[activeLang]`

Once a translation is entered, the reference box must disappear.

### **Styling**

.translation-reference {  
  background-color: var(--color-info-background);  
  border-inline-start: 4px solid var(--color-navy);  
  padding: var(--spacing-sm) var(--spacing-md);  
  margin-bottom: var(--spacing-sm);  
  border-radius: var(--radius-sm);  
}

.translation-reference-label {  
  font-size: var(--font-size-xs);  
  font-weight: var(--font-weight-semibold);  
  color: var(--color-text-secondary);  
  text-transform: uppercase;  
  letter-spacing: 0.05em;  
  margin-bottom: var(--spacing-xs);  
}

.translation-reference-text {  
  font-size: var(--font-size-sm);  
  color: var(--color-text-primary);  
  font-style: italic;  
}

**HTML Example:**

\<div class="translation-reference"\>  
  \<div class="translation-reference-label"\>English (Default)\</div\>  
  \<div class="translation-reference-text"\>Patient treatment protocol\</div\>  
\</div\>

---

## **Buttons**

### **Primary Action Buttons**

Use for primary actions like "Save", "Submit", "Create", "Confirm".

.btn-primary {  
  padding: 0.625rem 1.25rem;  
  font-size: var(--font-size-base);  
  font-weight: var(--font-weight-semibold);  
  color: var(--color-white);  
  background-color: var(--color-primary);  
  border: none;  
  border-radius: var(--radius-md);  
  cursor: pointer;  
  transition: all 0.2s ease;  
}

.btn-primary:hover:not(:disabled) {  
  background-color: var(--color-primary-hover);  
  box-shadow: var(--shadow-sm);  
}

.btn-primary:active:not(:disabled) {  
  transform: translateY(1px);  
}

.btn-primary:disabled {  
  opacity: 0.5;  
  cursor: not-allowed;  
}

### **Secondary Action Buttons**

Use for secondary actions like "Cancel", "Back", "Close".

.btn-secondary {  
  padding: 0.625rem 1.25rem;  
  font-size: var(--font-size-base);  
  font-weight: var(--font-weight-semibold);  
  color: var(--color-text-secondary);  
  background-color: var(--color-secondary-button-background);  
  border: none;  
  border-radius: var(--radius-md);  
  cursor: pointer;  
  transition: all 0.2s ease;  
}

.btn-secondary:hover:not(:disabled) {  
  background-color: var(--color-secondary-button-hover);  
}

.btn-secondary:active:not(:disabled) {  
  transform: translateY(1px);  
}

.btn-secondary:disabled {  
  opacity: 0.5;  
  cursor: not-allowed;  
}

### **Button Groups**

When displaying multiple buttons together (e.g., "Cancel" and "Save").

.button-group {  
  display: flex;  
  gap: var(--spacing-md);  
  justify-content: flex-end;  
  margin-top: var(--spacing-lg);  
  padding-top: var(--spacing-lg);  
  border-top: 1px solid var(--color-border-light);  
}

---

## **Modal & Edit Form Headers**

**Pages and windows look different:**

* **Windows** (edit forms, patient details, My Profile, settings, analysis, appointment editor) have a coloured header bar in the selected colour, with a white title, icon and close button. Use the shared `common/Modal` (optional `icon` prop) or the `--modal-header-*` tokens.  
* **Pages** (patient list, Today, admin lists, Knowledge, user management, activity log) have no bar. They have a plain title with an icon tile: use `common/PageTitle` with the page's sidebar icon.  
* **Small confirmation dialogs** (delete warnings) keep their own warning layout.

### **Header Styling**

.modal-header {  
  display: flex;  
  justify-content: space-between;  
  align-items: center;  
  padding: var(--spacing-md) var(--spacing-lg);  
  background-color: var(--modal-header-background);  
  color: var(--modal-header-text);  
  border-bottom: 1px solid var(--modal-header-border);  
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;  
}

.modal-title {  
  font-size: var(--font-size-lg);  
  font-weight: var(--font-weight-semibold);  
  margin: 0;  
}

.modal-close-button {  
  background: none;  
  border: none;  
  color: var(--modal-header-text);  
  cursor: pointer;  
  padding: var(--spacing-xs);  
  display: flex;  
  align-items: center;  
  justify-content: center;  
  border-radius: var(--radius-sm);  
  transition: background-color 0.2s ease;  
}

.modal-close-button:hover {  
  background-color: var(--modal-header-button-hover);  
}

.modal-close-icon {  
  width: 20px;  
  height: 20px;  
}

**HTML Example:**

\<div class="modal-header"\>  
  \<h2 class="modal-title"\>Edit Patient Details\</h2\>  
  \<button class="modal-close-button" onClick={closeModal}\>  
    \<X className="modal-close-icon" /\>  
  \</button\>  
\</div\>

---

## **Language Tabs (Multilingual Forms)**

### **Tab Ordering Rule**

When displaying language selection tabs:

1. **First tab:** User's current UI language (`i18n.language`) — always pinned first  
2. **Remaining tabs:** All other supported languages sorted alphabetically by language code

**Implementation:**

const orderedLangs \= \[currentLang, ...SUPPORTED\_LANGS.filter(l \=\> l \!== currentLang).sort()\]  
    .filter(l \=\> SUPPORTED\_LANGS.includes(l));

### **Tab Styling**

.language-tabs {  
  display: flex;  
  gap: var(--spacing-xs);  
  border-bottom: 2px solid var(--color-border-light);  
  margin-bottom: var(--spacing-lg);  
}

.language-tab {  
  padding: var(--spacing-sm) var(--spacing-md);  
  font-size: var(--font-size-sm);  
  font-weight: var(--font-weight-medium);  
  color: var(--color-text-secondary);  
  background: none;  
  border: none;  
  border-bottom: 2px solid transparent;  
  cursor: pointer;  
  transition: all 0.2s ease;  
  margin-bottom: \-2px;  
}

.language-tab:hover {  
  color: var(--color-text-primary);  
  background-color: var(--color-background-input-hover);  
}

.language-tab.active {  
  color: var(--color-selected);  
  border-bottom-color: var(--color-selected);  
  font-weight: var(--font-weight-semibold);  
}

---

## **File Upload / Photo Capture Areas**

File upload areas (e.g., "Add Pre-Treatment Photo") must be clearly interactive.

.upload-area {  
  border: 2px dashed var(--color-border);  
  border-radius: var(--radius-md);  
  padding: var(--spacing-xl);  
  text-align: center;  
  background-color: var(--color-background-input);  
  cursor: pointer;  
  transition: all 0.2s ease;  
}

.upload-area:hover {  
  border-color: var(--color-border-hover);  
  background-color: var(--color-background-input-hover);  
}

.upload-icon {  
  width: 48px;  
  height: 48px;  
  margin: 0 auto var(--spacing-sm);  
  color: var(--color-text-secondary);  
}

.upload-text {  
  font-size: var(--font-size-base);  
  color: var(--color-text-secondary);  
  font-weight: var(--font-weight-medium);  
}

.upload-subtext {  
  font-size: var(--font-size-sm);  
  color: var(--color-text-tertiary);  
  margin-top: var(--spacing-xs);  
}

**HTML Example:**

\<div class="upload-area" onClick={handleUpload}\>  
  \<Camera className="upload-icon" /\>  
  \<div class="upload-text"\>Click to capture or upload\</div\>  
  \<div class="upload-subtext"\>JPG, PNG up to 10MB\</div\>  
\</div\>

---

## **Validation & Error States**

### **Error Message Display**

.error-message {  
  display: flex;  
  align-items: center;  
  gap: var(--spacing-xs);  
  margin-top: var(--spacing-xs);  
  font-size: var(--font-size-sm);  
  color: var(--color-error);  
}

.error-icon {  
  width: 16px;  
  height: 16px;  
}

### **Input Error State**

input.error,  
textarea.error,  
select.error {  
  border-color: var(--color-error);  
}

input.error:focus,  
textarea.error:focus,  
select.error:focus {  
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);  
}

**HTML Example:**

\<div class="input-field"\>  
  \<label\>Email \<span class="required"\>\*\</span\>\</label\>  
  \<input type="email" class="error" value="invalid-email" /\>  
  \<div class="error-message"\>  
    \<AlertCircle className="error-icon" /\>  
    \<span\>Please enter a valid email address\</span\>  
  \</div\>  
\</div\>

---

## **Accessibility Requirements**

### **Focus Indicators**

All interactive elements must have clear focus indicators (already defined in input and button styles).

### **Color Contrast**

* Ensure all text meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text)  
* Never rely on color alone to convey information

### **Keyboard Navigation**

* All forms must be fully navigable via keyboard  
* Tab order must be logical  
* Enter key should submit forms where appropriate

### **Screen Reader Support**

* All inputs must have associated labels  
* Use `aria-label` for icon-only buttons  
* Mark required fields with `aria-required="true"`

---

## **Lists, Icons and Loading**

* **Row icon buttons** (edit, delete, documents) are grey (`--color-text-secondary`). Edit turns teal on hover (`--color-primary` on `--color-primary-light`). Delete turns red only on hover (`--color-error` on `--color-error-background`).  
* **Status and result badges** are soft tints with dark text, such as `--color-success-background` with a dark green. Never use a saturated fill with white text.  
* **Loading:** use `common/LoadingState` with the screen's existing loading text. It shows soft placeholder rows and is announced to screen readers. Never show plain "Loading..." text alone.  
* **Dates:** use `DateField` (dd/mm/yyyy), never the browser's own date input. Store date-only values as "yyyy-mm-dd" and convert with `fromIsoDate` / `toIsoDate` (`utils/appointments/time.ts`).

---

## **Summary Checklist**

When creating or reviewing a form, ensure:

* \[ \] Colours come from the tokens in `src/index.css` (no hard-coded hex where a token exists); teal for actions, navy for headings and selected states  
* \[ \] Page uses `--color-background-page` for overall background  
* \[ \] Form sections are wrapped in `.form-card` containers  
* \[ \] All inputs use consistent styling with proper states (default, hover, focus, disabled)  
* \[ \] Labels are positioned above inputs with proper spacing  
* \[ \] Required fields are marked with red asterisk  
* \[ \] Multilingual fields show globe icon and translation counter  
* \[ \] Translation reference boxes only appear when needed  
* \[ \] Primary buttons use `.btn-primary`, secondary use `.btn-secondary`  
* \[ \] Windows have the coloured header bar; pages have a plain title with an icon tile (`PageTitle`)  
* \[ \] Row icons are grey with a teal (edit) or red (delete) hover; badges are soft tints  
* \[ \] Upload areas are clearly interactive with icons  
* \[ \] Error states are clearly visible  
* \[ \] All spacing follows the defined spacing scale  
* \[ \] Focus states are clearly visible for accessibility

This style guide ensures a consistent, professional, and user-friendly experience across all forms in the application.

