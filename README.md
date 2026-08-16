# ApitherapyCare: Interactive 3D Treatment Planner

ApitherapyCare is a specialized management tool designed for apitherapy practitioners (caretakers). It streamlines the patient intake process and provides an interactive 3D humanoid model for precise mapping of bee sting locations.

## 🌟 Key Features

- **Automated Intake:** Professional form for gathering patient history, conditions, and allergy confirmation.
- **Interactive 3D Mapping:** A high-performance 3D humanoid model built with React Three Fiber. Practitioners can rotate the model and click to log specific treatment points.
- **Auto-Save Persistence:** Built-in session recovery using browser LocalStorage to prevent data loss.
- **Google Forms Integration:** One-click export that pre-fills an official Google Form for permanent record keeping.

## 🛠️ Technical Stack

- **Frontend:** React 18 (TypeScript), Vite
- **Styling:** Tailwind CSS (loaded via CDN in `index.html`)
- **3D Engine:** Three.js / React Three Fiber
- **Backend:** Firebase Cloud Functions (Node.js)
- **Data:** Firestore, Firebase Storage, BigQuery
- **Icons:** Lucide React

## 🚀 Getting Started

1. **Clone the repository:**
   ```bash
   git clone [your-repository-url]
   ```
2. **Setup environment:**
   - `npm install` to install dependencies.
   - `npm run dev` for local dev against Vite alone, or `npm run dev:all` to start the Firebase Emulator Suite (Auth 9099, Functions 5001, Firestore 8080, Hosting 5000, Storage 9199, Pub/Sub 8085; emulator UI on 5000).
   - See `docs/operations/environments.md` for the full environment matrix.

## 🛡️ Safety & Compliance

This application is designed with medical safety in mind:
- Mandatory allergy screening confirmations.
- Clear visual indicators for recommended vs. applied points.
- Session-based data handling to ensure privacy.

---
*Developed for professional apitherapy practitioners.*
