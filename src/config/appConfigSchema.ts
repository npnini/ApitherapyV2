
// src/config/appConfigSchema.ts

/**
 * Represents the type definition for a single, atomic setting.
 * Each setting will be rendered as a specific form control in the UI.
 */
export type ConfigSetting = {
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'protocol' | 'languages' | 'question' | 'defaultLanguage' | 'file' | 'mlString' | 'password';
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
  notificationSettings: {
    label: 'Notifications & Feedback',
    description: 'Configure email service and templates for all languages.',
    children: {
      emailApiKey: {
        label: 'Email API Key',
        description: 'API key for the email provider (e.g. Resend). This is a write-only secret; it will not be displayed after saving.',
        type: 'password',
        defaultValue: '',
      },
      senderEmail: {
        label: 'Sender Email',
        description: 'Verified sender email address.',
        type: 'string',
        defaultValue: 'noreply@beelive.biz',
      },
      frontendDomain: {
        label: 'Frontend URL Domain',
        description: 'Domain for generating links in emails.',
        type: 'string',
        defaultValue: 'beelive.biz',
      },
      feedbackRetentionDays: {
        label: 'Feedback Expiry (Days)',
        description: 'Days before feedback links expire.',
        type: 'number',
        defaultValue: 7,
      },
      feedbackTemplateId: {
        label: 'Feedback Email Template',
        description: 'Template identifiers for the automated feedback outreach.',
        type: 'mlString',
        defaultValue: {},
      },
      addProblemTemplateId: {
        label: 'Add Problem Email Template',
        description: 'Template identifiers for reporting missing protocols.',
        type: 'mlString',
        defaultValue: {},
      },
      intakeDocumentsTemplateId: {
        label: 'Intake Documents Template',
        description: 'Template identifiers for sending signed documents.',
        type: 'mlString',
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
      adhocProblemIdentifier: {
        label: 'Ad-hoc Problem Identifier',
        description: 'The problem that will be linked to ad-hoc (free selection) protocols.',
        type: 'string',
        defaultValue: '',
      },
      enableAISuggestions: {
        label: 'Enable AI Suggestions',
        description: 'If on, the system will suggest a treatment protocol based on patient data.',
        type: 'boolean',
        defaultValue: false,
      },
      proximityResultsCount: {
        label: 'Proximity Tap — Max Results',
        description: 'Maximum number of nearest acupuncture points to display when a practitioner taps the 3D model in Free Selection mode.',
        type: 'number',
        defaultValue: 5,
      },
      proximitySearchRadiusCun: {
        label: 'Proximity Tap — Search Radius (CUN)',
        description: 'Only points within this radius (in CUN, where 1 CUN ≈ 2 cm) of the tapped location will be shown. Default: 3 CUN ≈ 6 cm.',
        type: 'number',
        defaultValue: 3,
      },
      pointsCacheTTLMinutes: {
        label: 'Point List Cache Duration (Minutes)',
        description: 'How long the locally cached acupuncture point list stays valid before being refreshed from the database. Applies across all patients in one session.',
        type: 'number',
        defaultValue: 60,
      },
      standardWaitDirective: {
        label: 'Standard Wait Directive',
        description: 'Guidance text shown before removing stingers in standard treatments.',
        type: 'mlString',
        defaultValue: {
          en: 'Wait 15 minutes before removing the stingers, then measure the final vitals',
          he: 'יש להמתין 15 דקות לפני הוצאת העוקצים, ולאחר מכן למדוד מדדים סופיים'
        },
      },
      sensitivityWaitDirective: {
        label: 'Sensitivity Test Directive',
        description: 'Guidance text shown during sensitivity test sessions.',
        type: 'mlString',
        defaultValue: {
          en: 'Wait 10 minutes. If there is an allergic reaction, press End Treatment. If there is no allergic reaction, press Another Protocol',
          he: 'יש להמתין 10 דקות. אם מופיעה תגובה אלרגית, לחץ על סיום טיפול. אם אין תגובה אלרגית, לחץ על פרוטוקול נוסף'
        },
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
  auditLogSettings: {
    label: 'Audit Log',
    description: 'Settings for the application activity log.',
    children: {
      retentionDays: {
        label: 'Retention (Days)',
        description: 'Number of days to keep audit log entries. Older entries are automatically deleted nightly.',
        type: 'number',
        defaultValue: 90,
      },
    },
  },
};
