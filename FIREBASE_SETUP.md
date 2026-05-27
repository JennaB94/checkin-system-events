# Firebase Setup for Charity Event Check-In

## Step 1: Create a Firebase Project  
1. Go to the [Firebase Console](https://console.firebase.google.com/).  
2. Click on **Add Project**.  
3. Enter your project name (e.g., CharityEventCheckIn) and click **Continue**.  
4. (Optional) Enable Google Analytics for your project and click **Continue**.  
5. Click **Create Project** and wait a moment for Firebase to set it up.  
6. Click **Continue** to access your new project.

## Step 2: Set Up Firestore Database  
1. In the Firebase Console, select **Firestore Database** from the left-hand menu.  
2. Click **Create Database**.  
3. Choose a location for your database (e.g., us-central).  
4. Select **Start in Test Mode** (you can change this later for more security).  
5. Click **Done**.

## Step 3: Configure Database Rules  
The default Firestore rules allow read and write access to all users while in test mode. Update them accordingly:
```plaintext
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 4: Environment Variables  
You can use environment variables to store your Firebase configuration. Create a `.env` file in your project root with the following:
```plaintext
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
FIREBASE_DATABASE_URL=https://your_project_id.firebaseio.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
FIREBASE_APP_ID=your_app_id
```
Replace each placeholder with your Firebase project details found in the Firebase Console under the project settings.

## Step 5: Integrate with Check-In System  
1. Install Firebase SDK in your project:
   ```bash
   npm install firebase
   ```
2. Initialize Firebase in your app:
   ```javascript
   import { initializeApp } from "firebase/app";
   import { getFirestore } from "firebase/firestore";

   const firebaseConfig = {
     apiKey: process.env.FIREBASE_API_KEY,
     authDomain: process.env.FIREBASE_AUTH_DOMAIN,
     databaseURL: process.env.FIREBASE_DATABASE_URL,
     projectId: process.env.FIREBASE_PROJECT_ID,
     storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
     messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
     appId: process.env.FIREBASE_APP_ID
   };

   const app = initializeApp(firebaseConfig);
   const db = getFirestore(app);
   ```
3. Use the database to save check-in data as needed.

## Conclusion
This document provides a comprehensive guide for setting up Firebase for the Charity Event Check-In system. Adjust rules and configuration according to your security needs and environment.
