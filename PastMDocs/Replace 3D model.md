  
[https://github.com/Antonio-Abrao/acu-master](https://github.com/Antonio-Abrao/acu-master)

This is an excellent find. You've located a repository that is not only highly relevant but also shares the exact same core technology stack as your project, making it a prime candidate for integration.

After a thorough evaluation of the acu-master repository, I can confirm that it is **highly feasible** to integrate its model and point data into your ApitherapyCare application. This is a much better approach than the Sketchfab model because it provides the two things you need most: a suitable 3D model and, critically, the **pre-mapped 3D coordinates for a comprehensive set of acupuncture points.**

Here is a detailed feasibility study of what it would take.

---

| Feature | Your ApitherapyCare Project | acu-master Repository | Integration Verdict & Notes |
| :---- | :---- | :---- | :---- |
| **Technology** | React, @react-three/fiber, @react-three/drei | React, @react-three/fiber, @react-three/drei | ✅ **Perfect Match.** The core rendering technology is identical. This dramatically reduces integration complexity. |
| **3D Model** | Xbot.glb (A generic, robotic mannequin) | male.gltf (A more realistic, anatomical human model) | ✅ **High Value.** The acu-master model is more professional and better suited for a medical application. |
| **Point Data** | apipunctureData.ts contains a *small subset* of points you manually mapped (e.g., ST36, GV14). | The src/points directory contains JavaScript files for **all major meridians** (LU, LI, ST, SP, etc.), each with pre-mapped \[x,y,z\] coordinates. | ⭐ **This is the biggest win.** acu-master has already done the most laborious work: mapping hundreds of points to the model. This saves you dozens, if not hundreds, of hours. |
| **Interaction** | You can click on the model to place markers. | You can click on the model to highlight points. It also has a search/list feature to select points *from outside the model*. | ✅ **Excellent.** It proves the concept you were asking about. Your existing onPointClick logic can be easily adapted. You can also adopt their external selection feature. |

Integrating the assets from acu-master is the ideal path forward. It solves the primary challenge of your 3D module: the lack of a comprehensive, pre-mapped point library. It provides a better model and a clear pattern for the external selection feature you want.

---

Here is the plan to integrate the acu-master assets into your project.

1. **Copy the Model:** Download the male.gltf file from the acu-master/public/models/ directory and place it in your public/ directory.  
2. **Copy the Point Data:** Copy the entire src/points directory from acu-master into your src/data/ directory. This folder is the gold mine, containing all the point coordinates.

Your current ALL\_POINTS object is manually defined. You will replace it with the comprehensive data from acu-master.

**Create a New ALL\_POINTS Object:** In apipunctureData.ts, you will import all the points from the new directory and combine them into a single object. It would look something like this:  
// src/data/apipunctureData.ts

import \* as BL from './points/BL';  
import \* as CV from './points/CV';  
import \* as GV from './points/GV';  
// ... import all other meridian files

// Combine all points into one master object  
export const ALL\_POINTS \= {  
  ...BL,  
  ...CV,  
  ...GV,  
  // ... spread all other imported points  
};

// Note: The structure from acu-master is slightly different.   
// You may need a small script to re-map it to your {id, name, coords} format.  
// Example: { BL1: { name\_en: 'Jingming', coords: \[..\] } } \-\> { id: 'BL1', name: 'Jingming', coords: \[..\] }

1.   
2. **Update Your Protocols:** Your APITHERAPY\_PROTOCOLS currently reference your old point definitions (e.g., ALL\_POINTS.ST36). You will need to ensure these still point to the correct entries in the new, comprehensive ALL\_POINTS object. The names should still match.  
1. **Change the Model URL:** In apipunctureData.ts, update the MANNEQUIN\_URL constant to point to your new local model: export const MANNEQUIN\_URL \= '/male.gltf';.  
2. **Adjust Scene in Interactive3DModel.tsx:**  
   * The new model will have a different size and default position. You will need to tweak the PerspectiveCamera position and OrbitControls target to frame the new model correctly.  
   * You may also need to adjust the position of the \<group\> or the model itself to ensure it sits properly on the ground plane.

This integration is overwhelmingly positive. The effort is primarily in refactoring your data file and adjusting the camera, which is minor compared t  
