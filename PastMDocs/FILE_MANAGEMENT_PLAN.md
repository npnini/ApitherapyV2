# File Management Implementation Plan

This document outlines the strategy and step-by-step process for implementing file upload and management functionality within the application.

The goal is to allow an admin user, from within the app, to upload, view, replace, and delete documents associated with specific data entities (like "Points," "Protocols," or "Patients"). The file itself will be stored in **Firebase Storage**, and a link (URL) to that file will be saved in the corresponding **Firestore** document.

---

## The Plan

### Step 1: Create a Centralized File Handling Service

*   **Action:** Create a new service file at `src/services/storageService.ts`.
*   **Purpose:** This file will contain all the logic for interacting with Firebase Storage. This keeps our code clean and reusable.
*   **Key Functions:**
    1.  `uploadFile(file, folderPath)`: This function will take a file object and a destination folder name (e.g., "point_documents"). It will upload the file to Firebase Storage and return the permanent download URL.
    2.  `deleteFile(fileUrl)`: This function will take the URL of a file stored in Firebase Storage, figure out its location in the storage bucket, and delete it.

### Step 2: Create a Reusable UI Component for File Management

*   **Action:** Create a new React component at `src/components/FileUpload.tsx`.
*   **Purpose:** This will be the visual part of the file management that the admin interacts with. Making it a separate component allows us to easily reuse it for Points, Protocols, Patients, etc.
*   **Functionality:**
    *   If no file is currently associated, it will display an "Upload Document" button.
    *   If a file already exists, it will display:
        *   A "View Document" link that opens the file in a new tab.
        *   A "Replace" button (which will trigger the file selection dialog).
        *   A "Delete" button.
    *   It will handle its own internal state, such as showing a loading indicator while a file is uploading.

### Step 3: Integrate the `FileUpload` Component into the Point Definition Screen

*   **Action:** Modify the existing screen where you create or edit a "Point".
*   **Purpose:** To connect the new file management UI with the "Point" data.
*   **Implementation:**
    1.  Add the `<FileUpload />` component to the form on that screen.
    2.  The Point Definition screen will manage a `documentUrl` in its state.
    3.  This `documentUrl` will be passed to the `<FileUpload />` component.
    4.  When the `FileUpload` component successfully uploads or deletes a file, it will notify the parent Point Definition screen to update its `documentUrl` state.
    5.  When the admin clicks the main "Save Point" button, this `documentUrl` (which will be the file link or `null`) will be saved to the Point's document in Firestore.

### Step 4: Add Internationalization (i18n) Support

*   **Action:** Update the English (`en`) and Hebrew (`he`) translation files.
*   **Purpose:** To ensure all new buttons and messages can be displayed in both languages.
*   **New Text:** We will add keys for "Upload Document", "View Document", "Replace", "Delete", "Uploading...", and any potential error messages.
