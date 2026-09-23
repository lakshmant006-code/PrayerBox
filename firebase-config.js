// Firebase settings for sign-in (email/password and Google).
//
// Until this is filled in, the site runs in demo mode: any email and password are accepted.
//
// To turn on real sign-in:
//  1. Go to https://console.firebase.google.com and create a project.
//  2. Build > Authentication > Get started. Under "Sign-in method", enable
//     "Email/Password" and "Google".
//  3. Authentication > Settings > Authorized domains: add the domain the site runs on
//     (e.g. lakshmant006-code.github.io). "localhost" is there by default.
//  4. Project settings (gear icon) > General > "Your apps" > add a Web app (</>).
//     Copy the firebaseConfig values it shows into the object below.
//
// These values are meant to be public; they identify the project, they are not a password.
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAh2i1IJnwb0R5z--Uws-Vy7sUHEnn3Zlk',
  authDomain: 'prayerbox-eb61f.firebaseapp.com',
  projectId: 'prayerbox-eb61f',
  storageBucket: 'prayerbox-eb61f.firebasestorage.app',
  messagingSenderId: '720001565454',
  appId: '1:720001565454:web:0063795477da672979cd5f'
};
