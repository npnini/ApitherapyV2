# **CSS Styling Guide**

## **Core Design Principles**

This guide ensures a consistent, professional, and user-friendly interface across all forms in the application. The design prioritizes clarity and usability while maintaining a clean, medical-grade professional appearance.

---

## **Color System**

### **Base Colors**

:root {  
  /\* Primary \*/  
  \--color-primary: \#2563eb; /\* Primary blue for key actions \*/  
  \--color-primary-hover: \#1d4ed8;  
  \--color-primary-light: \#dbeafe;  
  \--color-primary-rgb: 37, 99, 235; /\* For rgba usage \*/  
    
  /\* Backgrounds \*/  
  \--color-background-page: \#f9fafb; /\* Light gray page background \*/  
  \--color-background-card: \#ffffff; /\* White for cards/containers \*/  
  \--color-background-input: \#ffffff; /\* White for input fields \*/  
  \--color-background-input-hover: \#f9fafb; /\* Subtle hover state \*/  
  \--color-background-input-disabled: \#f3f4f6; /\* Disabled inputs \*/  
    
  /\* Borders \*/  
  \--color-border: \#d1d5db; /\* Medium gray \- default borders \*/  
  \--color-border-light: \#e5e7eb; /\* Light gray \- subtle dividers \*/  
  \--color-border-hover: \#9ca3af; /\* Darker gray \- hover state \*/  
  \--color-border-focus: var(--color-primary); /\* Blue \- focus state \*/  
    
  /\* Text \*/  
  \--color-text-primary: \#111827; /\* Dark gray \- main text \*/  
  \--color-text-secondary: \#6b7280; /\* Medium gray \- secondary text \*/  
  \--color-text-tertiary: \#9ca3af; /\* Light gray \- placeholders \*/  
  \--color-white: \#ffffff;  
    
  /\* Semantic Colors \*/  
  \--color-error: \#dc2626;  
  \--color-error-background: \#fef2f2;  
  \--color-success: \#16a34a;  
  \--color-success-background: \#f0fdf4;  
  \--color-warning: \#ea580c;  
  \--color-warning-background: \#fff7ed;  
  \--color-info-background: \#eff6ff; /\* Light blue for reference boxes \*/  
    
  /\* Button Colors \*/  
  \--color-secondary-button-background: \#f3f4f6;  
  \--color-secondary-button-hover: \#e5e7eb;  
    
  /\* Shadows \*/  
  \--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);  
  \--shadow-card: 0 1px 3px 0 rgba(0, 0, 0, 0.1);  
  \--shadow-input-focus: 0 0 0 3px rgba(37, 99, 235, 0.1);  
  \--shadow-modal: 0 20px 25px \-5px rgba(0, 0, 0, 0.1);  
    
  /\* Spacing \*/  
  \--spacing-xs: 0.25rem; /\* 4px \*/  
  \--spacing-sm: 0.5rem; /\* 8px \*/  
  \--spacing-md: 1rem; /\* 16px \*/  
  \--spacing-lg: 1.5rem; /\* 24px \*/  
  \--spacing-xl: 2rem; /\* 32px \*/  
    
  /\* Border Radius \*/  
  \--radius-sm: 4px;  
  \--radius-md: 6px;  
  \--radius-lg: 8px;  
    
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
  border-left: 4px solid var(--color-primary);  
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

All edit forms, especially those in modals, must include a standardized header bar.

### **Header Styling**

.modal-header {  
  display: flex;  
  justify-content: space-between;  
  align-items: center;  
  padding: var(--spacing-md) var(--spacing-lg);  
  background-color: var(--color-primary);  
  color: var(--color-white);  
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
  color: var(--color-white);  
  cursor: pointer;  
  padding: var(--spacing-xs);  
  display: flex;  
  align-items: center;  
  justify-content: center;  
  border-radius: var(--radius-sm);  
  transition: background-color 0.2s ease;  
}

.modal-close-button:hover {  
  background-color: rgba(255, 255, 255, 0.1);  
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
  color: var(--color-primary);  
  border-bottom-color: var(--color-primary);  
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

## **Summary Checklist**

When creating or reviewing a form, ensure:

* \[ \] Page uses `--color-background-page` for overall background  
* \[ \] Form sections are wrapped in `.form-card` containers  
* \[ \] All inputs use consistent styling with proper states (default, hover, focus, disabled)  
* \[ \] Labels are positioned above inputs with proper spacing  
* \[ \] Required fields are marked with red asterisk  
* \[ \] Multilingual fields show globe icon and translation counter  
* \[ \] Translation reference boxes only appear when needed  
* \[ \] Primary buttons use `.btn-primary`, secondary use `.btn-secondary`  
* \[ \] Modal headers follow the standard layout  
* \[ \] Upload areas are clearly interactive with icons  
* \[ \] Error states are clearly visible  
* \[ \] All spacing follows the defined spacing scale  
* \[ \] Focus states are clearly visible for accessibility

This style guide ensures a consistent, professional, and user-friendly experience across all forms in the application.

