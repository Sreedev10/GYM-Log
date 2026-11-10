# 💪 Gym Log – Fitness & Workout Tracker

A modern fitness tracking mobile application built with React Native and Expo. Gym Log helps users record workouts, track fitness progress, monitor progressive overload, and manage their daily training activities.

## 🚀 Features

- **User Authentication** – Secure registration and login.
- **Workout Tracking** – Log daily exercises, sets, reps, and weights.
- **Exercise Library** – Manage and track exercises.
- **Progressive Overload** – Monitor improvements in workout performance.
- **Workout History** – Review previous workouts and training records.
- **Progress Statistics** – Visualize fitness progress and workout activity.
- **Cardio Tracking** – Record cardio activities.
- **Abs Tracking** – Track abdominal workouts.
- **Workout Routines** – Organize training plans and routines.
- **Rest Timer** – Manage rest intervals between sets.
- **Personal Profile** – Manage personal settings and account information.

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| React Native | Mobile application development |
| Expo | Development and build platform |
| JavaScript | Application programming |
| Supabase | Backend and database services |
| PostgreSQL | Database |
| Supabase Auth | User authentication |

## 📱 Getting Started

### Prerequisites

- Node.js
- npm
- Expo Go or Android Emulator
- Supabase account

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Sreedev10/GYM-Log.git
   ```

2. Navigate to the project directory:

   ```bash
   cd GYM-Log
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Configure Supabase.

   Create a project in [Supabase](https://supabase.com/) and configure your project URL and public anon/publishable key in the application's Supabase configuration.

   Make sure your database tables and Row Level Security (RLS) policies are configured.

5. Start the application:

   ```bash
   npx expo start
   ```

6. Scan the QR code using Expo Go or run the application on an emulator.

## 🗄️ Backend

Gym Log uses Supabase for:

- User authentication
- PostgreSQL database management
- Workout data storage
- User-specific data access

## 📂 Project Structure

```text
GYM-Log/
│
├── assets/          # Application assets
├── App.js           # Main application entry
├── app.json         # Expo configuration
├── eas.json         # EAS build configuration
├── index.js         # Application entry point
├── supabase.js      # Supabase configuration
├── package.json     # Dependencies and scripts
└── README.md        # Project documentation
```

## 🔮 Future Enhancements

- Advanced fitness analytics and charts
- Custom workout plan creation
- Personal records and achievements
- Enhanced workout recommendations
- More detailed fitness statistics

## 👨‍💻 Developer

**Sreedev S Kurup**

- GitHub: [@Sreedev10](https://github.com/Sreedev10)

---

⭐ If you find this project interesting, consider giving it a star!
