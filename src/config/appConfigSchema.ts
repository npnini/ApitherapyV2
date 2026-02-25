
// src/config/appConfigSchema.ts

/**
 * Represents the type definition for a single, atomic setting.
 * Each setting will be rendered as a specific form control in the UI.
 */
export type ConfigSetting = {
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'protocol' | 'languages' | 'question' | 'defaultLanguage' | 'file';
  defaultValue: string | number | boolean | string[] | Record<string, any>;
};

/**
 * Represents a group of settings. A group can contain individual settings
 * or other nested groups, allowing for a hierarchical structure.
 */
export type ConfigGroup = {
  label: string;
  description: string;
  children: { [key: string]: ConfigSetting | ConfigGroup };
};

/**
 * The main application configuration schema.
 *
 * This object is read by the `ApplicationSettings` component to dynamically
 * generate the settings form. To add, remove, or modify a setting,
 * a developer only needs to update this schema. The UI will adapt automatically.
 *
 * The keys of this object serve as the keys in the saved Firestore document.
 */
export const appConfigSchema: { [key: string]: ConfigGroup } = {
  languageSettings: {
    label: 'Languages',
    description: 'Configure the languages supported by the application.',
    children: {
      supportedLanguages: {
        label: 'Supported Languages',
        description: 'Choose the languages your application will support.',
        type: 'languages',
        defaultValue: ['en'],
      },
      defaultLanguage: {
        label: 'Default Language',
        description: 'Select the default language for the application.',
        type: 'defaultLanguage',
        defaultValue: 'en',
      },
    },
  },
  consentSettings: {
    label: 'Patient Consent',
    description: 'Manage consent document templates for each supported language.',
    children: {
      consent_files: {
        label: 'Consent Templates',
        description: 'Upload a consent form for each language.',
        type: 'file',
        defaultValue: {},
      }
    }
  },
  treatmentInstructions: {
    label: 'Treatment Instructions',
    description: 'Manage treatment instruction templates for each supported language.',
    children: {
      instructionsFiles: {
        label: 'Instruction Templates',
        description: 'Upload a treatment instructions form for each language.',
        type: 'file',
        defaultValue: {},
      }
    }
  },
  treatmentSettings: {
    label: 'Treatment Process',
    description: 'Settings that control the logic and flow of patient treatments.',
    children: {
      initialSensitivityTestTreatments: {
        label: 'Initial Sensitivity Test Treatments',
        description: 'The number of initial treatments a new patient must undergo using the "Sensitivity Protocol" before other protocols can be used.',
        type: 'number',
        defaultValue: 3,
      },
      sensitivityProtocolIdentifier: {
        label: 'Sensitivity Protocol Identifier',
        description: 'The protocol to be used for initial sensitivity testing.',
        type: 'protocol',
        defaultValue: 'sensitivity_protocol_v1',
      },
      freeProtocolIdentifier: {
        label: 'Free Protocol Identifier',
        description: 'The protocol to be used for freely selecting sting points.',
        type: 'protocol',
        defaultValue: '',
      },
      enableAISuggestions: {
        label: 'Enable AI Suggestions',
        description: 'If on, the system will suggest a treatment protocol based on patient data.',
        type: 'boolean',
        defaultValue: false,
      },
    },
  },
  patientDashboard: {
    label: 'Patient Dashboard',
    description: 'Settings related to the patient dashboard.',
    children: {
      domain: {
        label: 'Domain',
        description: 'The medical domain the system is used for',
        type: 'string',
        defaultValue: 'apitherapy',
      },
      conditionQuestion: {
        label: 'Condition Question Identifier',
        description: 'Select the question that represents the patient\'s condition.',
        type: 'question',
        defaultValue: '',
      },
      severityQuestion: {
        label: 'Severity Question Identifier',
        description: 'Select the question that represents the severity of the patient\'s condition.',
        type: 'question',
        defaultValue: '',
      },
    },
  },
};
