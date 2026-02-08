# Gemini AI Rules: Environment & Application Logic


## SECTION 1: INFRASTRUCTURE (Nix & Firebase Studio)
* **Context:** This is a Nix-based environment defined by `.idx/dev.nix`.
* **Packages:** Use the `packages` list in `dev.nix` for dependencies.
* **Previews:** Web previews are managed via `idx.previews`.
* **Expertise:** When asked about the environment, refer to Nix language and declarative configuration.


## SECTION 2: MANDATORY STYLING & RTL RULES
* **RTL/LTR Support:** The app supports English (LTR) and Hebrew (RTL).
* **CSS Variables:** ALWAYS use variables from `src/globals.css`. NO hardcoded hex codes or pixel values.
* **Logical Properties:** Use `margin-inline-start`, `padding-inline-end`, and `text-align: start` to automate direction flipping.
* **Typography:** * Hebrew: Use font-weight 700 for Headers, 600 for Labels.
    * English: Standard weights as defined in `globals.css`.


## SECTION 3: CODING & MODIFICATION RULES
* **Permissions:** NEVER modify a component without asking permission first.
* **Scope:** Modify ONLY the components instructed.
* **Dependencies:** If a change affects multiple files, explain the impact clearly.
* **Testing:** ALWAYS generate unit tests for functional changes.
* **Tone:** Keep explanations short, technical, and concise. No emotional opinions.