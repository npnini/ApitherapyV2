# Migration Guide: Moving to a Version-less Project Name

This document outlines the strategy and step-by-step process for migrating this project to a generic, version-less naming convention (e.g., "apitherapy"). This approach is a best practice that enhances brand consistency and simplifies long-term maintenance.

It also details how to properly manage separate **Development (Test)** and **Production** environments, a critical practice for building stable, scalable applications.

---

## Part 1: The Migration Plan to "apitherapy"

This process involves creating new, cleanly named infrastructure and moving your existing code into it.

### Phase A: Create New Foundations (Manual Steps)

These steps must be performed manually through the respective service consoles.

1.  **Create a New GitHub Repository:**
    *   Go to GitHub and create a **new, empty** repository named `apitherapy`.
    *   **Do not** initialize it with a `README`, `.gitignore`, or any other files.
    *   After creation, copy the new repository's HTTPS URL.

2.  **Create a New Firebase Project (for Production):**
    *   Go to the [Firebase Console](https://console.firebase.google.com/).
    *   Create a **new project** and name it `apitherapy`. This will be your **Production** environment.
    *   Inside the new project, go to **Project Settings -> General** and create a new **Web App**.
    *   Firebase will provide a `firebaseConfig` object. **Copy this entire object**; you will need it later.
    *   Enable **Authentication** (with the same providers as your old project) and **Firestore Database**. Copy the security rules from your old project to the new one.

### Phase B: Migrate the Codebase (AI-Assisted Steps)

Once Phase A is complete, you can instruct the AI assistant to perform the following.

1.  **Relink Git Repository:**
    *   The assistant will run the following command to point the local codebase to your new repository:
        ```bash
        git remote set-url origin [Your-New-GitHub-Repo-URL]
        ```

2.  **Push Existing Code:**
    *   The assistant will then push all the existing code to the new `apitherapy` repository's `main` branch.

3.  **Update Firebase Configuration:**
    *   Provide the AI with the new `firebaseConfig` object from Phase A. The assistant will update the configuration in the codebase, likely in `src/services/firebaseConfig.js`.

4.  **Commit and Push Changes:**
    *   The assistant will commit the updated configuration and push it to the new repository.

### Phase C: Launch the New Workspace (Manual Steps)

1.  **Delete the Old Workspace:**
    *   In your Firebase Studio dashboard, find the old workspace (`ApitherapyV1` or `ApitherapyV2`) and delete it. All your code is safe in the new GitHub repository.

2.  **Create the New Workspace:**
    *   On the same dashboard, click **"Import Repo"**.
    *   Select your new `apitherapy` repository from GitHub to create a fresh, cleanly named workspace.

---

## Part 2: Managing Test vs. Production Environments

To test new features without affecting your live user data, you must use separate environments. The standard approach is to use two distinct Firebase projects.

*   **Production Project:** `apitherapy` (the one created in Phase A). This contains live user data.
*   **Development Project:** Create a second Firebase project named `apitherapy-dev`. This is for testing and development.

The key is to switch between these two Firebase configurations without manually editing the code each time. This is done with **environment variables**.

### How to Use Environment Variables

1.  **Create a `.env.local` File:**
    *   In the root of your project, create a file named `.env.local`. **This file should never be committed to GitHub.**
    *   Your `.gitignore` file should have an entry for `.env.local` to prevent this.

2.  **Populate the Environment File:**
    *   Go to your `apitherapy-dev` Firebase project and get its `firebaseConfig` object.
    *   Structure your `.env.local` file like this, prefixing each variable with `VITE_` (this is required by the Vite build tool):

    ```
    VITE_FIREBASE_API_KEY="your-dev-api-key"
    VITE_FIREBASE_AUTH_DOMAIN="your-dev-auth-domain"
    VITE_FIREBASE_PROJECT_ID="apitherapy-dev"
    VITE_FIREBASE_STORAGE_BUCKET="your-dev-storage-bucket"
    VITE_FIREBASE_MESSAGING_SENDER_ID="your-dev-sender-id"
    VITE_FIREBASE_APP_ID="your-dev-app-id"
    ```

3.  **Update Your Code to Use Environment Variables:**
    *   Modify your `src/services/firebaseConfig.js` file to read these variables from the environment.

    ```javascript
    // src/services/firebaseConfig.js

    // This configuration now safely reads from environment variables
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    // ... rest of the file (initializeApp, etc.)
    ```

### The Workflow

*   **Local Development:** When you run the app locally, Vite automatically loads the variables from `.env.local`. Your app will connect to the `apitherapy-dev` database, keeping your production data safe.
*   **Production Deployment:** When you deploy your app to Firebase Hosting, you will configure the **production** environment variables in the hosting environment settings. The deployed app will then automatically use your `apitherapy` (production) project keys.
