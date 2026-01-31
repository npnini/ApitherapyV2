# ApitherapyCare: Interactive 3D Treatment Planner

ApitherapyCare is a specialized management tool designed for apitherapy practitioners (caretakers). It streamlines the patient intake process, uses AI to recommend treatment protocols, and provides an interactive 3D humanoid model for precise mapping of bee sting locations.

## 🌟 Key Features

- **Automated Intake:** Professional form for gathering patient history, conditions, and allergy confirmation.
- **AI Protocol Selection:** Integration with Gemini 3 Pro to analyze patient severity and recommend the most effective treatment protocol.
- **Interactive 3D Mapping:** A high-performance 3D humanoid model built with React Three Fiber. Practitioners can rotate the model and click to log specific treatment points.
- **Auto-Save Persistence:** Built-in session recovery using browser LocalStorage to prevent data loss.
- **Google Forms Integration:** One-click export that pre-fills an official Google Form for permanent record keeping.

## 🛠️ Technical Stack

- **Frontend:** React 19 (TypeScript)
- **Styling:** Tailwind CSS
- **3D Engine:** Three.js / React Three Fiber
- **AI Engine:** Google Gemini API (@google/genai)
- **Icons:** Lucide React

## 🚀 Getting Started

1. **Clone the repository:**
   ```bash
   git clone [your-repository-url]
   ```
2. **Setup environment:**
   - Ensure you have a valid Gemini API Key.
   - For local development, this app is designed to run in a modern ES6 module environment.

## 🛡️ Safety & Compliance

This application is designed with medical safety in mind:
- Mandatory allergy screening confirmations.
- Clear visual indicators for recommended vs. applied points.
- Session-based data handling to ensure privacy.

---
*Developed for professional apitherapy practitioners.*
