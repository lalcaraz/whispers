# Whispers - An E2E encrypted chat application that moves messages over push notifications.

## IMPORTANT
This project is just a PoC, could not be ready for production BUT i am using it as my personal chat app for my family and friends.
This repository contains both the backend and frontend projects for the Whispers application.

## Who am I?
My name is Luis Alcaraz. I have been a Software Engineer, Network Administrator and others in between since 2005. You can find more about me at https://lalcaraz.com

## Why does Whispers exists?
Even that I write software from 9 to 5, I ocassionally do some personal projects on weekends to spice up my skills. Not all of them are "exciting enough" to be made public, this one is different given the current political events happening around the globe in 2026. While I'm not thinking on putting this into the AppStore or Play Store I wanted to make it public because someone might find it useful. That said, I TAKE NO RESPONSABILITY OVER THE SECURITY OF THIS APP. I made it as secure as I could given that was a weekend project. 

Would I update this code base? Maybe, but it's not guaranteed. 

---

## Project Structure

- **whispers-nodejs-be/**: Node.js backend server
- **whispers-rn-fe/**: React Native frontend mobile app

---

## whispers-nodejs-be (Backend)

- **Tech Stack:** Node.js, Express, SQLite (or other DB)
- **Location:** `whispers-nodejs-be/`
- **Main files:**
  - `src/server.js`: Main server entry point
  - `src/db.js`: Database connection and logic
  - `data/`: Database files (excluded from version control)
- **Setup:**
  1. `cd whispers-nodejs-be`
  2. Install dependencies: `npm install`
  3. Start server: `npm start` or `node src/server.js`
- **Environment Variables:**
  - Create a `.env` file for secrets (not included in repo)

---

## whispers-rn-fe (Frontend)

- **Tech Stack:** React Native, TypeScript
- **Location:** `whispers-rn-fe/`
- **Main files:**
  - `src/App.tsx`: Main app entry point
  - `android/`, `ios/`: Native project files
- **Setup:**
  1. `cd whispers-rn-fe`
  2. Install dependencies: `npm install`
  3. Run on Android: `npx react-native run-android`
  4. Run on iOS: `npx react-native run-ios`
- **Environment Variables:**
  - Create a `.env` file for secrets (not included in repo)
  - GoogleService-Info.plist and google-services.json are placeholders; use your own for production

---

## General Notes

- **Secrets:** Never commit secrets, API keys, or credentials. Use `.env` files and keep them out of version control.
- **Contributing:**
  - Fork the repo and submit pull requests. If it's of interest, i will merge it.
  - Open issues for bugs or feature requests but don't expect a quick response. This was more of a PoC and a weekend project but I will help as much as I can.
- **License:** Apache 2.0

---

For more details, see the individual `README.md` files in each project folder.
