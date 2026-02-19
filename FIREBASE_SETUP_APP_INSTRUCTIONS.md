
# Firebase Setup and App Instructions

This document provides the necessary steps to configure the Firebase backend and make the application fully functional.

## 1. Firebase Project Setup

1.  **Create a Firebase Project:** Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  **Add a Web App:** Inside your project, add a new Web App. Firebase will provide you with a configuration object.

## 2. Configure the Application

1.  **Update Firebase Config:** Open the `services/firebaseConfig.js` file and replace the placeholder values with the configuration object you obtained from your Firebase project.

    ```javascript
    // services/firebaseConfig.js

    const firebaseConfig = {
      apiKey: "YOUR_API_KEY", // Replace with your key
      authDomain: "YOUR_AUTH_DOMAIN", // Replace with your domain
      projectId: "YOUR_PROJECT_ID", // Replace with your project ID
      storageBucket: "YOUR_STORAGE_BUCKET", // Replace with your bucket
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // Replace with your sender ID
      appId: "YOUR_APP_ID", // Replace with your app ID
    };
    ```

2.  **Install Firebase SDK:** Open your terminal and run the following command to install the necessary Firebase library:

    ```bash
    npm install firebase
    ```

## 3. Enable Authentication

1.  **Enable Sign-in Methods:** In the Firebase Console, navigate to the **Authentication** section.
2.  Go to the **Sign-in method** tab.
3.  Enable the **Email/Password** provider.
4.  Enable the **Google** provider. You will also need to configure the OAuth consent screen and provide a project support email.

## 4. Set up Firestore Database

1.  **Create Firestore Database:** In the Firebase Console, navigate to the **Firestore Database** section.
2.  Click **Create database** and start in **Production mode**.
3.  Choose a location for your database.

4.  **Update Security Rules:** Go to the **Rules** tab in the Firestore section and paste the following rules. These rules ensure that each user can only access their own data. Click **Publish**.

    ```
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        // Users can only read and write their own documents
        match /users/{userId}/{documents=**} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
    ```

## 5. Integrate Firebase into the App

The file `services/authService.js` now contains functions to handle user login, registration, and data fetching. You will need to import and use these functions in your React components.

For example, in your `App.tsx`, you could modify the 'login' view to display login buttons that call the functions from `authService.js`:

```jsx
// Example modification in your Login View component

import { signInWithGoogle, signInWithEmail } from './services/authService.js';

const LoginView = () => {

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      // On success, you would typically redirect the user or update the app state
      console.log("Signed in with Google successfully!");
    } catch (error) {
      console.error("Google sign-in error:", error);
    }
  };

  // Add similar handlers for email/password forms...

  return (
    <div>
      {/* ... your login UI ... */}
      <button onClick={handleGoogleLogin}>Sign in with Google</button>
      {/* ... email/password form ... */}
    </div>
  );
};
```

## 6. Gemini API Key

As mentioned in the `README.md`, this app uses the Gemini API. The `ProtocolSelector.tsx` component relies on the `getProtocolRecommendation` function in `services/geminiService.ts` which is currently a placeholder. You need to implement the actual API call to Gemini there.

---
By following these steps, your application will be connected to a secure and cost-effective Firebase backend.
