// ==============================================================================
// GYM LOG — React Native & Expo Mobile Workout Tracker
// ==============================================================================
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Vibration,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';

// ------------------------------------------------------------------------------
// SETTINGS & CONSTANTS
// ------------------------------------------------------------------------------
const COUNTRY = '+91';
const DEFAULT_SETS = 4;
const DEFAULT_REPS = 10;
const WEIGHT_STEP = 2.5;
const REPS_STEP = 1;
const REST_TIME = 90;

// Weekly Workout Routine
const PLAN = {
  1: {
    day: 'Monday',
    name: 'Shoulder day',
    exercises: ['Shoulder press', 'Lateral raise', 'Front raise', 'Face pulls', 'Shrugs'],
  },
  2: {
    day: 'Tuesday',
    name: 'Biceps day',
    exercises: ['Bicep curls', 'Z-bar curls', '21 curls', 'Hammer curls'],
  },
  3: {
    day: 'Wednesday',
    name: 'Chest day',
    exercises: ['Flat chest press', 'Incline chest press', 'Chest fly (pec deck)', 'Decline chest press', 'Cable downward flies'],
  },
  4: {
    day: 'Thursday',
    name: 'Triceps day',
    exercises: ['Overhead dumbbell press', 'Bar pushdown', 'Cable pushdown', 'Bench dips', 'Reverse bar pushdown'],
  },
  5: {
    day: 'Friday',
    name: 'Leg day',
    exercises: ['Squats (machine/Smith)', 'Leg press', 'Leg extension', 'Leg curls', 'Lunges'],
  },
  6: {
    day: 'Saturday',
    name: 'Back day',
    exercises: ['Lat pulldown', 'Seated cable row', 'Dumbbell rows', 'T-bar row', 'Deadlift (light/Romanian)'],
  },
  0: {
    day: 'Sunday',
    name: 'Rest day',
    exercises: [],
  },
};

// Date utilities
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDates(referenceDate) {
  const current = new Date(referenceDate);
  const day = current.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(current);
  monday.setDate(current.getDate() + diffToMonday);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// Progressive Overload Calculation Engine
function calculateSuggestion(previousSets) {
  if (!previousSets || previousSets.length === 0) {
    return {
      type: 'FIRST_TIME',
      suggestedWeight: 20,
      targetReps: DEFAULT_REPS,
      text: 'First time: Start at 20 kg x 10 reps',
    };
  }

  const maxWeight = Math.max(...previousSets.map((s) => Number(s.w) || 0));
  const setsAtMax = previousSets.filter((s) => Number(s.w) === maxWeight);
  const allHit10 = setsAtMax.length > 0 &&
    setsAtMax.every((s) => (Number(s.r) || 0) >= 10);

  if (allHit10) {
    const nextWeight = maxWeight + WEIGHT_STEP;
    return {
      type: 'INCREASE_WEIGHT',
      suggestedWeight: nextWeight,
      targetReps: 8,
      text: `Hit 10 reps on all sets! Try ${nextWeight} kg today 💪`,
    };
  }

  return {
    type: 'REPEAT_WEIGHT',
    suggestedWeight: maxWeight,
    targetReps: 10,
    text: `Last: ${maxWeight} kg. Push for 10 reps on each set!`,
  };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // App tabs & date
  const [activeTab, setActiveTab] = useState('workout');
  const todayStr = useMemo(() => formatLocalDate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Workouts and Extras data
  const [workouts, setWorkouts] = useState([]);
  const [extras, setExtras] = useState({});
  const [cardioSessions, setCardioSessions] = useState([]);
  const [abSessions, setAbSessions] = useState([]);
  const [extraForm, setExtraForm] = useState(null);
  const [cardioActivity, setCardioActivity] = useState('Running');
  const [cardioDuration, setCardioDuration] = useState('');
  const [cardioDistance, setCardioDistance] = useState('');
  const [cardioCalories, setCardioCalories] = useState('');
  const [cardioNotes, setCardioNotes] = useState('');
  const [absExerciseName, setAbsExerciseName] = useState('Crunches');
  const [absSets, setAbsSets] = useState('3');
  const [absReps, setAbsReps] = useState('15');
  const [absWeight, setAbsWeight] = useState('0');
  const [absNotes, setAbsNotes] = useState('');
  const [savingExtra, setSavingExtra] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  // Active workout editor
  const [expandedExercise, setExpandedExercise] = useState(null);
  const [activeSets, setActiveSets] = useState([]);
  const [customExerciseInput, setCustomExerciseInput] = useState('');
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [customExercisesByDate, setCustomExercisesByDate] = useState({});

  // 90s Rest timer
  const [restSecondsLeft, setRestSecondsLeft] = useState(null);
  const timerRef = useRef(null);

  // Session persistence and authentication
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch user data when session changes
  useEffect(() => {
    if (session?.user) {
      fetchUserWorkouts();
    }
  }, [session]);

  async function fetchUserWorkouts() {
    if (!session?.user?.id) return;

    setLoadingData(true);

    try {
      const { data: sessions, error: sessionsError } = await supabase
        .from('workout_sessions')
        .select('id, workout_date')
        .eq('user_id', session.user.id)
        .order('workout_date', { ascending: false });

      if (sessionsError) throw sessionsError;

      let mappedWorkouts = [];

      if (sessions?.length) {
        const sessionIds = sessions.map((item) => item.id);

        const { data: exerciseRows, error: exerciseError } = await supabase
          .from('workout_exercises')
          .select('id, session_id, exercise_name, order_index')
          .in('session_id', sessionIds);

        if (exerciseError) throw exerciseError;

        const exerciseIds = (exerciseRows || []).map((item) => item.id);
        let setRows = [];

        if (exerciseIds.length) {
          const { data, error } = await supabase
            .from('workout_sets')
            .select('workout_exercise_id, set_number, reps, weight, is_warmup')
            .in('workout_exercise_id', exerciseIds)
            .order('set_number', { ascending: true });

          if (error) throw error;
          setRows = data || [];
        }

        const sessionDateById = Object.fromEntries(
          sessions.map((item) => [item.id, item.workout_date])
        );

        mappedWorkouts = (exerciseRows || []).map((exercise) => ({
          date: sessionDateById[exercise.session_id],
          exercise: exercise.exercise_name,
          sets: setRows
            .filter((set) =>
              set.workout_exercise_id === exercise.id && !set.is_warmup
            )
            .map((set) => ({
              w: Number(set.weight) || 0,
              r: Number(set.reps) || 0,
              done: true,
            })),
        }));
      }

      setWorkouts(mappedWorkouts);

      const { data: cardioRows, error: cardioError } = await supabase
        .from('cardio_sessions')
        .select('id, activity, duration_minutes, distance_km, calories_burned, activity_date, notes')
        .eq('user_id', session.user.id)
        .order('activity_date', { ascending: false });

      if (cardioError) throw cardioError;
      setCardioSessions(cardioRows || []);

      const { data: absRows, error: absError } = await supabase
        .from('ab_sessions')
        .select('id, exercise_name, sets, reps, weight, activity_date, notes')
        .eq('user_id', session.user.id)
        .order('activity_date', { ascending: false });

      if (absError) throw absError;
      setAbSessions(absRows || []);

      const dateFlags = {};

      (cardioRows || []).forEach((row) => {
        dateFlags[row.activity_date] = [
          ...(dateFlags[row.activity_date] || []),
          'Cardio',
        ];
      });

      (absRows || []).forEach((row) => {
        dateFlags[row.activity_date] = [
          ...(dateFlags[row.activity_date] || []),
          'Abs',
        ];
      });

      setExtras(dateFlags);
    } catch (error) {
      console.log('Error fetching workout data:', error.message);
      Alert.alert('Workout Loading Error', error.message);
    } finally {
      setLoadingData(false);
    }
  }  // Rest Timer
  useEffect(() => {
    if (restSecondsLeft !== null && restSecondsLeft > 0) {
      timerRef.current = setTimeout(() => {
        setRestSecondsLeft((prev) => (prev ? prev - 1 : null));
      }, 1000);
    } else if (restSecondsLeft === 0) {
      Vibration.vibrate([0, 400, 200, 400]);
      setRestSecondsLeft(null);
    }

    return () => clearTimeout(timerRef.current);
  }, [restSecondsLeft]);

  // Email and password authentication
  async function handleEmailAuth() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Password Too Short', 'Please use at least 6 characters.');
      return;
    }

    setAuthSubmitting(true);

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });

        if (error) throw error;

        if (data.session) {
          setSession(data.session);
        } else {
          Alert.alert(
            'Account Created',
            'Your account was created. You can now log in with your email and password.'
          );
          setAuthMode('login');
          setPassword('');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;
        setSession(data.session);
      }
    } catch (error) {
      Alert.alert(
        authMode === 'signup' ? 'Registration Failed' : 'Login Failed',
        error.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setAuthSubmitting(false);
    }
  }

  // Logout
  function handleLogout() {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }

  // Workout helpers
  const selectedDayPlan = PLAN[new Date(selectedDate).getDay()] || PLAN[0];

  const selectedDayWorkouts = workouts.filter(
    (w) => w.date === selectedDate
  );

  const loggedExerciseNames = new Set(
    selectedDayWorkouts.map((w) => w.exercise)
  );

  // Combine planned exercises with custom exercises added for this date.
  const selectedDayExerciseNames = [
    ...new Set([
      ...selectedDayPlan.exercises,
      ...(customExercisesByDate[selectedDate] || []),
      ...selectedDayWorkouts.map((item) => item.exercise),
    ]),
  ];

  function handleAddCustomExercise() {
    const exerciseName = customExerciseInput.trim();

    if (!exerciseName) {
      Alert.alert('Exercise Name Required', 'Enter the name of your exercise.');
      return;
    }

    const alreadyExists = selectedDayExerciseNames.some(
      (name) => name.toLowerCase() === exerciseName.toLowerCase()
    );

    if (alreadyExists) {
      Alert.alert('Already Added', "This exercise is already in today's list.");
      return;
    }

    setCustomExercisesByDate((previous) => ({
      ...previous,
      [selectedDate]: [
        ...(previous[selectedDate] || []),
        exerciseName,
      ],
    }));

    setCustomExerciseInput('');
    setShowAddExercise(false);
    handleOpenExercise(exerciseName);
  }

  const weekDates = useWeekDatesMemo(selectedDate);
  // Dates that contain at least one saved activity
  const historyDates = [
    ...new Set([
      ...workouts.map((item) => item.date),
      ...cardioSessions.map((item) => item.activity_date),
      ...abSessions.map((item) => item.activity_date),
    ]),
  ].sort((a, b) => b.localeCompare(a));

  function useWeekDatesMemo(refDate) {
    return useMemo(() => getWeekDates(refDate), [refDate]);
  }

  function getPrevSession(exerciseName) {
    const prev = workouts
      .filter(
        (w) =>
          w.exercise === exerciseName &&
          w.date < selectedDate &&
          w.sets?.length > 0
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    return prev[0] || null;
  }

  // Open exercise editor
  function handleOpenExercise(exerciseName) {
    if (expandedExercise === exerciseName) {
      setExpandedExercise(null);
      return;
    }

    setExpandedExercise(exerciseName);

    const existing = selectedDayWorkouts.find(
      (w) => w.exercise === exerciseName
    );

    if (existing && existing.sets?.length > 0) {
      setActiveSets(existing.sets.map((s) => ({ ...s, done: true })));
    } else {
      const prev = getPrevSession(exerciseName);
      const suggestion = calculateSuggestion(prev?.sets);
      const setsArray = [];

      for (let i = 0; i < DEFAULT_SETS; i++) {
        setsArray.push({
          w: suggestion.suggestedWeight,
          r: suggestion.targetReps,
          done: false,
        });
      }

      setActiveSets(setsArray);
    }
  }

  // Save strength exercise to Supabase
  async function handleSaveExercise(exerciseName) {
    const completedSets = activeSets
      .filter((set) => set.done)
      .map((set) => ({
        w: Number(set.w),
        r: Number(set.r),
      }));

    if (!completedSets.length) {
      Alert.alert('Tick Sets', 'Please mark finished sets before saving.');
      return;
    }

    if (!session?.user?.id) {
      Alert.alert('Not Logged In', 'Please log in again before saving.');
      return;
    }

    try {
      // Find or create the workout session for this date.
      let {
        data: workoutSession,
        error: sessionLookupError,
      } = await supabase
        .from('workout_sessions')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('workout_date', selectedDate)
        .limit(1)
        .maybeSingle();

      if (sessionLookupError) throw sessionLookupError;

      if (!workoutSession) {
        const { data, error } = await supabase
          .from('workout_sessions')
          .insert({
            user_id: session.user.id,
            workout_date: selectedDate,
            started_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (error) throw error;
        workoutSession = data;
      }

      // Find or create the exercise row.
      let {
        data: workoutExercise,
        error: exerciseLookupError,
      } = await supabase
        .from('workout_exercises')
        .select('id')
        .eq('session_id', workoutSession.id)
        .eq('exercise_name', exerciseName)
        .limit(1)
        .maybeSingle();

      if (exerciseLookupError) throw exerciseLookupError;

      if (!workoutExercise) {
        const { data, error } = await supabase
          .from('workout_exercises')
          .insert({
            session_id: workoutSession.id,
            exercise_name: exerciseName,
            order_index:
              selectedDayPlan.exercises.indexOf(exerciseName) >= 0
                ? selectedDayPlan.exercises.indexOf(exerciseName)
                : selectedDayPlan.exercises.length + selectedDayWorkouts.length,
            rest_seconds: REST_TIME,
          })
          .select('id')
          .single();

        if (error) throw error;
        workoutExercise = data;
      }

      // Replace the set rows for this exercise.
      const { error: deleteError } = await supabase
        .from('workout_sets')
        .delete()
        .eq('workout_exercise_id', workoutExercise.id);

      if (deleteError) throw deleteError;

      const setPayload = completedSets.map((set, index) => ({
        workout_exercise_id: workoutExercise.id,
        set_number: index + 1,
        reps: set.r,
        weight: set.w,
        is_warmup: false,
      }));

      const { error: insertSetsError } = await supabase
        .from('workout_sets')
        .insert(setPayload);

      if (insertSetsError) throw insertSetsError;

      const localWorkout = {
        date: selectedDate,
        exercise: exerciseName,
        sets: completedSets.map((set) => ({
          ...set,
          done: true,
        })),
      };

      setWorkouts((previous) => {
        const filtered = previous.filter(
          (item) =>
            !(item.date === selectedDate && item.exercise === exerciseName)
        );

        return [...filtered, localWorkout];
      });

      setExpandedExercise(null);
      setRestSecondsLeft(REST_TIME);

      Alert.alert('Saved', `${exerciseName} was saved successfully.`);
    } catch (error) {
      console.log('Error saving workout:', error.message);
      Alert.alert('Save Error', error.message);
    }
  }  // Open the Cardio or Abs entry form.
  function handleToggleExtra(type) {
    setExtraForm((current) => (current === type ? null : type));
  }

  // Save cardio entry to Supabase.
  async function handleSaveCardio() {
    const duration = Number(cardioDuration);

    if (
      !cardioActivity.trim() ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      Alert.alert(
        'Check Cardio Details',
        'Choose an activity and enter a duration greater than zero.'
      );
      return;
    }

    if (!session?.user?.id) return;

    setSavingExtra(true);

    try {
      const payload = {
        user_id: session.user.id,
        activity: cardioActivity.trim(),
        duration_minutes: Math.round(duration),
        distance_km: cardioDistance.trim()
          ? Number(cardioDistance)
          : null,
        calories_burned: cardioCalories.trim()
          ? Math.round(Number(cardioCalories))
          : null,
        activity_date: selectedDate,
        notes: cardioNotes.trim() || null,
      };

      if (
        payload.distance_km !== null &&
        (!Number.isFinite(payload.distance_km) || payload.distance_km < 0)
      ) {
        throw new Error('Distance must be a valid number.');
      }

      if (
        payload.calories_burned !== null &&
        (!Number.isFinite(payload.calories_burned) ||
          payload.calories_burned < 0)
      ) {
        throw new Error('Calories must be a valid number.');
      }

      const { data, error } = await supabase
        .from('cardio_sessions')
        .insert(payload)
        .select(
          'id, activity, duration_minutes, distance_km, calories_burned, activity_date, notes'
        )
        .single();

      if (error) throw error;

      setCardioSessions((items) => [data, ...items]);

      setExtras((items) => ({
        ...items,
        [selectedDate]: [
          ...(items[selectedDate] || []),
          'Cardio',
        ],
      }));

      setCardioDuration('');
      setCardioDistance('');
      setCardioCalories('');
      setCardioNotes('');
      setExtraForm(null);

      Alert.alert('Saved', 'Cardio activity saved successfully.');
    } catch (error) {
      console.log('Error saving cardio:', error.message);
      Alert.alert('Cardio Save Error', error.message);
    } finally {
      setSavingExtra(false);
    }
  }

  // Save abs entry to Supabase.
  async function handleSaveAbs() {
    const sets = Number(absSets);
    const reps = Number(absReps);
    const weight = Number(absWeight || 0);

    if (
      !absExerciseName.trim() ||
      !Number.isInteger(sets) ||
      sets <= 0 ||
      !Number.isInteger(reps) ||
      reps <= 0 ||
      !Number.isFinite(weight) ||
      weight < 0
    ) {
      Alert.alert(
        'Check Abs Details',
        'Enter an exercise name, positive sets and reps, and a valid weight.'
      );
      return;
    }

    if (!session?.user?.id) return;

    setSavingExtra(true);

    try {
      const payload = {
        user_id: session.user.id,
        exercise_name: absExerciseName.trim(),
        sets,
        reps,
        weight,
        activity_date: selectedDate,
        notes: absNotes.trim() || null,
      };

      const { data, error } = await supabase
        .from('ab_sessions')
        .insert(payload)
        .select(
          'id, exercise_name, sets, reps, weight, activity_date, notes'
        )
        .single();

      if (error) throw error;

      setAbSessions((items) => [data, ...items]);

      setExtras((items) => ({
        ...items,
        [selectedDate]: [
          ...(items[selectedDate] || []),
          'Abs',
        ],
      }));

      setAbsNotes('');
      setExtraForm(null);

      Alert.alert('Saved', 'Abs workout saved successfully.');
    } catch (error) {
      console.log('Error saving abs workout:', error.message);
      Alert.alert('Abs Save Error', error.message);
    } finally {
      setSavingExtra(false);
    }
  }

  // --------------------------------------------------------------------------
  // RENDER: Loading or Auth Screen
  // --------------------------------------------------------------------------
  if (authLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#e0a800" />
      </View>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.authContainer}
        >
          <Text style={styles.appTitle}>GYM LOG</Text>
          <Text style={styles.appSubtitle}>
            Progressive Overload Workout Tracker
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardHeader}>
              {authMode === 'signup'
                ? 'Create Your Account'
                : 'Welcome Back'}
            </Text>

            <TextInput
              style={styles.authInput}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              placeholder="Email address"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
            />

            <TextInput
              style={styles.authInput}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={
                authMode === 'signup'
                  ? 'new-password'
                  : 'current-password'
              }
              placeholder="Password (minimum 6 characters)"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              style={[
                styles.goldButton,
                authSubmitting && { opacity: 0.6 },
              ]}
              onPress={handleEmailAuth}
              disabled={authSubmitting}
            >
              {authSubmitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.goldButtonText}>
                  {authMode === 'signup'
                    ? 'Create Account'
                    : 'Log In'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setAuthMode(
                  authMode === 'signup' ? 'login' : 'signup'
                );
                setPassword('');
              }}
              style={{ marginTop: 18 }}
              disabled={authSubmitting}
            >
              <Text style={styles.linkText}>
                {authMode === 'signup'
                  ? 'Already have an account? Log in'
                  : "Don't have an account? Sign up"}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
    // --------------------------------------------------------------------------
  // RENDER: Main Tracker Screen
  // --------------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.brandText}>GYM LOG</Text>
          <Text style={styles.userPhoneText}>
            {session?.user?.email || 'Lifter'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>

      {/* Workout / History Tabs */}
      <View style={{
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 8,
        backgroundColor: '#1a1f24',
        borderRadius: 12,
        padding: 5,
      }}>
        {['workout', 'history'].map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: 'center',
              borderRadius: 9,
              backgroundColor:
                activeTab === tab ? '#e0a800' : 'transparent',
            }}
          >
            <Text style={{
              color: activeTab === tab ? '#101316' : '#ffffff',
              fontWeight: '800',
            }}>
              {tab === 'workout' ? 'Workout' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'workout' && (
        <>
          {/* Week Strip */}
          <View style={styles.weekStrip}>
            {weekDates.map((d) => {
              const dStr = formatLocalDate(d);
              const isSelected = dStr === selectedDate;
              const dayShort = [
                'Sun',
                'Mon',
                'Tue',
                'Wed',
                'Thu',
                'Fri',
                'Sat',
              ][d.getDay()];

              const hasLogged = workouts.some((w) => w.date === dStr);

              return (
                <TouchableOpacity
                  key={dStr}
                  style={[
                    styles.dayButton,
                    isSelected && styles.dayButtonSelected,
                  ]}
                  onPress={() => setSelectedDate(dStr)}
                >
                  <Text
                    style={[
                      styles.dayButtonText,
                      isSelected && styles.dayButtonTextSelected,
                    ]}
                  >
                    {dayShort}
                  </Text>

                  <Text
                    style={[
                      styles.dateText,
                      isSelected && styles.dateTextSelected,
                    ]}
                  >
                    {d.getDate()}
                  </Text>

                  {hasLogged && <View style={styles.loggedDot} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView style={styles.scrollArea}>
            {/* Day Routine Title */}
            <View style={styles.dayRoutineCard}>
              <Text style={styles.routineDayName}>
                {selectedDayPlan.day}
              </Text>
              <Text style={styles.routineTheme}>
                {selectedDayPlan.name}
              </Text>
            </View>

            {/* Add a custom exercise to this day's workout */}
            <View style={styles.addExerciseCard}>
              {!showAddExercise ? (
                <TouchableOpacity
                  style={styles.addExerciseButton}
                  onPress={() => setShowAddExercise(true)}
                >
                  <Text style={styles.addExerciseButtonText}>＋ Add Exercise</Text>
                </TouchableOpacity>
              ) : (
                <View>
                  <Text style={styles.formLabel}>New exercise name</Text>
                  <TextInput
                    style={styles.formInput}
                    value={customExerciseInput}
                    onChangeText={setCustomExerciseInput}
                    placeholder="e.g. Cable crossover"
                    placeholderTextColor="#66717c"
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={handleAddCustomExercise}
                  />
                  <View style={styles.addExerciseActions}>
                    <TouchableOpacity
                      style={styles.cancelAddExerciseButton}
                      onPress={() => {
                        setShowAddExercise(false);
                        setCustomExerciseInput('');
                      }}
                    >
                      <Text style={styles.cancelAddExerciseText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmAddExerciseButton}
                      onPress={handleAddCustomExercise}
                    >
                      <Text style={styles.confirmAddExerciseText}>Add & Log</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Exercises List */}
            {selectedDayExerciseNames.map((name) => {
              const isLogged = loggedExerciseNames.has(name);
              const isExpanded = expandedExercise === name;
              const prev = getPrevSession(name);
              const suggestion = calculateSuggestion(prev?.sets);

              return (
                <View key={name} style={styles.exerciseCard}>
                  <TouchableOpacity
                    style={styles.exerciseHeader}
                    onPress={() => handleOpenExercise(name)}
                  >
                    <View>
                      <Text style={styles.exerciseTitle}>{name}</Text>
                      <Text style={styles.suggestionSmall}>
                        {suggestion.text}
                      </Text>
                    </View>

                    <Text
                      style={
                        isLogged
                          ? styles.statusDone
                          : styles.statusPending
                      }
                    >
                      {isLogged ? '✓ Done' : '+ Log'}
                    </Text>
                  </TouchableOpacity>

                  {/* Expanded Set Logger */}
                  {isExpanded && (
                    <View style={styles.setEditor}>
                      {activeSets.map((s, idx) => (
                        <View key={idx} style={styles.setRow}>
                          <Text style={styles.setText}>
                            Set {idx + 1}
                          </Text>

                          {/* Weight stepper */}
                          <View style={styles.stepperContainer}>
                            <TouchableOpacity
                              style={styles.stepBtn}
                              onPress={() => {
                                const copy = [...activeSets];
                                copy[idx].w = Math.max(
                                  0,
                                  copy[idx].w - WEIGHT_STEP
                                );
                                setActiveSets(copy);
                              }}
                            >
                              <Text style={styles.stepBtnText}>-</Text>
                            </TouchableOpacity>

                            <Text style={styles.stepVal}>
                              {s.w} kg
                            </Text>

                            <TouchableOpacity
                              style={styles.stepBtn}
                              onPress={() => {
                                const copy = [...activeSets];
                                copy[idx].w += WEIGHT_STEP;
                                setActiveSets(copy);
                              }}
                            >
                              <Text style={styles.stepBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Reps stepper */}
                          <View style={styles.stepperContainer}>
                            <TouchableOpacity
                              style={styles.stepBtn}
                              onPress={() => {
                                const copy = [...activeSets];
                                copy[idx].r = Math.max(
                                  1,
                                  copy[idx].r - REPS_STEP
                                );
                                setActiveSets(copy);
                              }}
                            >
                              <Text style={styles.stepBtnText}>-</Text>
                            </TouchableOpacity>

                            <Text style={styles.stepVal}>
                              {s.r} r
                            </Text>

                            <TouchableOpacity
                              style={styles.stepBtn}
                              onPress={() => {
                                const copy = [...activeSets];
                                copy[idx].r += REPS_STEP;
                                setActiveSets(copy);
                              }}
                            >
                              <Text style={styles.stepBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Set completion tick */}
                          <TouchableOpacity
                            style={[
                              styles.checkBtn,
                              s.done && styles.checkBtnDone,
                            ]}
                            onPress={() => {
                              const copy = [...activeSets];
                              copy[idx].done = !copy[idx].done;
                              setActiveSets(copy);
                            }}
                          >
                            <Text style={styles.checkBtnText}>✓</Text>
                          </TouchableOpacity>
                        </View>
                      ))}

                      <TouchableOpacity
                        style={styles.saveBtn}
                        onPress={() => handleSaveExercise(name)}
                      >
                        <Text style={styles.saveBtnText}>
                          Save Exercise
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Extras: Cardio / Abs */}
            <View style={styles.extraCard}>
              <Text style={styles.extraTitle}>Finish with:</Text>

              <View style={styles.extraRow}>
                <TouchableOpacity
                  style={[
                    styles.extraBtn,
                    extras[selectedDate]?.includes('Cardio') &&
                      styles.extraBtnActive,
                  ]}
                  onPress={() => handleToggleExtra('Cardio')}
                >
                  <Text style={styles.extraBtnText}>Cardio</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.extraBtn,
                    extras[selectedDate]?.includes('Abs') &&
                      styles.extraBtnActive,
                  ]}
                  onPress={() => handleToggleExtra('Abs')}
                >
                  <Text style={styles.extraBtnText}>Abs</Text>
                </TouchableOpacity>
              </View>

              {/* Cardio Form */}
              {extraForm === 'Cardio' && (
                <View style={styles.extraForm}>
                  <Text style={styles.formLabel}>Activity</Text>

                  <View style={styles.activityChoices}>
                    {[
                      'Running',
                      'Walking',
                      'Cycling',
                      'Treadmill',
                      'Elliptical',
                      'Other',
                    ].map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={[
                          styles.activityChip,
                          cardioActivity === item &&
                            styles.activityChipActive,
                        ]}
                        onPress={() => setCardioActivity(item)}
                      >
                        <Text
                          style={[
                            styles.activityChipText,
                            cardioActivity === item &&
                              styles.activityChipTextActive,
                          ]}
                        >
                          {item}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.formLabel}>
                    Duration (minutes) *
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={cardioDuration}
                    onChangeText={setCardioDuration}
                    keyboardType="numeric"
                    placeholder="e.g. 30"
                    placeholderTextColor="#66717c"
                  />

                  <Text style={styles.formLabel}>Distance (km)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={cardioDistance}
                    onChangeText={setCardioDistance}
                    keyboardType="decimal-pad"
                    placeholder="Optional"
                    placeholderTextColor="#66717c"
                  />

                  <Text style={styles.formLabel}>Calories burned</Text>
                  <TextInput
                    style={styles.formInput}
                    value={cardioCalories}
                    onChangeText={setCardioCalories}
                    keyboardType="numeric"
                    placeholder="Optional"
                    placeholderTextColor="#66717c"
                  />

                  <Text style={styles.formLabel}>Notes</Text>
                  <TextInput
                    style={styles.formInput}
                    value={cardioNotes}
                    onChangeText={setCardioNotes}
                    placeholder="Optional notes"
                    placeholderTextColor="#66717c"
                  />

                  <TouchableOpacity
                    style={[
                      styles.saveBtn,
                      savingExtra && { opacity: 0.6 },
                    ]}
                    onPress={handleSaveCardio}
                    disabled={savingExtra}
                  >
                    <Text style={styles.saveBtnText}>
                      {savingExtra ? 'Saving...' : 'Save Cardio'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Abs Form */}
              {extraForm === 'Abs' && (
                <View style={styles.extraForm}>
                  <Text style={styles.formLabel}>Exercise name *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={absExerciseName}
                    onChangeText={setAbsExerciseName}
                    placeholder="e.g. Crunches"
                    placeholderTextColor="#66717c"
                  />

                  <Text style={styles.formLabel}>Sets *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={absSets}
                    onChangeText={setAbsSets}
                    keyboardType="numeric"
                    placeholder="3"
                    placeholderTextColor="#66717c"
                  />

                  <Text style={styles.formLabel}>Reps per set *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={absReps}
                    onChangeText={setAbsReps}
                    keyboardType="numeric"
                    placeholder="15"
                    placeholderTextColor="#66717c"
                  />

                  <Text style={styles.formLabel}>Weight (kg)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={absWeight}
                    onChangeText={setAbsWeight}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#66717c"
                  />

                  <Text style={styles.formLabel}>Notes</Text>
                  <TextInput
                    style={styles.formInput}
                    value={absNotes}
                    onChangeText={setAbsNotes}
                    placeholder="Optional notes"
                    placeholderTextColor="#66717c"
                  />

                  <TouchableOpacity
                    style={[
                      styles.saveBtn,
                      savingExtra && { opacity: 0.6 },
                    ]}
                    onPress={handleSaveAbs}
                    disabled={savingExtra}
                  >
                    <Text style={styles.saveBtnText}>
                      {savingExtra ? 'Saving...' : 'Save Abs Workout'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Saved cardio entries for selected date */}
              {cardioSessions.filter(
                (item) => item.activity_date === selectedDate
              ).length > 0 && (
                <View style={styles.savedExtras}>
                  <Text style={styles.formLabel}>Saved cardio</Text>

                  {cardioSessions
                    .filter((item) => item.activity_date === selectedDate)
                    .map((item) => (
                      <Text
                        key={item.id}
                        style={styles.savedExtraText}
                      >
                        • {item.activity} · {item.duration_minutes} min
                        {item.distance_km != null
                          ? ` · ${item.distance_km} km`
                          : ''}
                        {item.calories_burned != null
                          ? ` · ${item.calories_burned} kcal`
                          : ''}
                      </Text>
                    ))}
                </View>
              )}

              {/* Saved abs entries for selected date */}
              {abSessions.filter(
                (item) => item.activity_date === selectedDate
              ).length > 0 && (
                <View style={styles.savedExtras}>
                  <Text style={styles.formLabel}>
                    Saved abs workouts
                  </Text>

                  {abSessions
                    .filter((item) => item.activity_date === selectedDate)
                    .map((item) => (
                      <Text
                        key={item.id}
                        style={styles.savedExtraText}
                      >
                        • {item.exercise_name} · {item.sets} sets × {item.reps} reps
                        {Number(item.weight) > 0
                          ? ` · ${item.weight} kg`
                          : ''}
                      </Text>
                    ))}
                </View>
              )}
            </View>
          </ScrollView>
        </>
      )}
            {/* History Screen */}
      {activeTab === 'history' && (
        <ScrollView style={styles.scrollArea}>
          <View style={styles.dayRoutineCard}>
            <Text style={styles.routineDayName}>YOUR PROGRESS</Text>
            <Text style={styles.routineTheme}>Workout History</Text>
            <Text style={styles.suggestionSmall}>
              {historyDates.length} active days recorded
            </Text>
          </View>

          {historyDates.length === 0 ? (
            <View style={styles.dayRoutineCard}>
              <Text style={styles.exerciseTitle}>
                No workout history yet
              </Text>
              <Text style={styles.suggestionSmall}>
                Your saved workouts, cardio and abs sessions will appear here.
              </Text>
            </View>
          ) : (
            historyDates.map((date) => {
              const dayWorkouts = workouts.filter(
                (item) => item.date === date
              );
              const dayCardio = cardioSessions.filter(
                (item) => item.activity_date === date
              );
              const dayAbs = abSessions.filter(
                (item) => item.activity_date === date
              );
              const displayDate = new Date(
                `${date}T00:00:00`
              ).toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });

              return (
                <View key={date} style={styles.exerciseCard}>
                  <View style={{ padding: 16 }}>
                    <Text style={styles.routineDayName}>
                      {displayDate}
                    </Text>

                    {dayWorkouts.map((item, index) => (
                      <View key={`${item.exercise}-${index}`}>
                        <Text style={styles.exerciseTitle}>
                          {item.exercise}
                        </Text>
                        {item.sets?.map((set, setIndex) => (
                          <Text key={setIndex} style={styles.savedExtraText}>
                            Set {setIndex + 1}: {set.w} kg × {set.r} reps
                          </Text>
                        ))}
                      </View>
                    ))}

                    {dayCardio.map((item) => (
                      <View key={item.id} style={{ marginTop: 12 }}>
                        <Text style={styles.exerciseTitle}>
                          Cardio · {item.activity}
                        </Text>
                        <Text style={styles.savedExtraText}>
                          Duration: {item.duration_minutes} minutes
                        </Text>
                        {item.distance_km != null && (
                          <Text style={styles.savedExtraText}>
                            Distance: {item.distance_km} km
                          </Text>
                        )}
                        {item.calories_burned != null && (
                          <Text style={styles.savedExtraText}>
                            Calories: {item.calories_burned} kcal
                          </Text>
                        )}
                      </View>
                    ))}

                    {dayAbs.map((item) => (
                      <View key={item.id} style={{ marginTop: 12 }}>
                        <Text style={styles.exerciseTitle}>
                          Abs · {item.exercise_name}
                        </Text>
                        <Text style={styles.savedExtraText}>
                          {item.sets} sets × {item.reps} reps
                          {Number(item.weight) > 0
                            ? ` · ${item.weight} kg`
                            : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Floating 90s Rest Timer */}
      {restSecondsLeft !== null && (
        <View style={styles.timerBar}>
          <Text style={styles.timerText}>
            Rest: {restSecondsLeft}s
          </Text>

          <TouchableOpacity
            onPress={() => setRestSecondsLeft(null)}
          >
            <Text style={styles.timerSkip}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ------------------------------------------------------------------------------
// STYLES
// ------------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101316',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#e0a800',
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 13,
    color: '#8f9aa5',
    textAlign: 'center',
    marginBottom: 30,
  },
  card: {
    backgroundColor: '#1a1f24',
    padding: 20,
    borderRadius: 16,
    borderColor: '#2a3138',
    borderWidth: 1,
  },
  cardHeader: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 15,
  },
  authInput: {
    backgroundColor: '#101316',
    padding: 14,
    borderRadius: 12,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a3138',
    marginBottom: 14,
  },
  goldButton: {
    backgroundColor: '#e0a800',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  goldButtonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
  infoText: {
    color: '#8f9aa5',
    fontSize: 13,
    marginBottom: 15,
  },
  linkText: {
    color: '#e0a800',
    textAlign: 'center',
    fontSize: 13,
  },
  topHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  paddingHorizontal: 16,
  paddingTop:
    Platform.OS === 'android'
      ? (StatusBar.currentHeight || 24) + 12
      : 12,
  paddingBottom: 12,
  borderBottomWidth: 1,
  borderBottomColor: '#2a3138',
  },
  brandText: {
    color: '#e0a800',
    fontWeight: '900',
    fontSize: 18,
  },
  userPhoneText: {
    color: '#8f9aa5',
    fontSize: 11,
  },
  logoutButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#222830',
    borderRadius: 8,
  },
  logoutText: {
    color: '#fff',
    fontSize: 12,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3138',
  },
  dayButton: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    minWidth: 42,
  },
  dayButtonSelected: {
    backgroundColor: '#e0a800',
  },
  dayButtonText: {
    color: '#8f9aa5',
    fontSize: 11,
    fontWeight: '700',
  },
  dayButtonTextSelected: {
    color: '#000',
  },
  dateText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  dateTextSelected: {
    color: '#000',
  },
  loggedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e0a800',
    marginTop: 3,
  },
  scrollArea: {
    flex: 1,
    padding: 16,
  },
  dayRoutineCard: {
    backgroundColor: '#1a1f24',
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a3138',
  },
  routineDayName: {
    color: '#e0a800',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  routineTheme: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  addExerciseCard: {
    backgroundColor: '#1a1f24',
    borderRadius: 14,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#5a4818',
  },
  addExerciseButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  addExerciseButtonText: {
    color: '#e0a800',
    fontSize: 14,
    fontWeight: '800',
  },
  addExerciseActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelAddExerciseButton: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: '#222830',
  },
  cancelAddExerciseText: {
    color: '#d0d5da',
    fontWeight: '700',
  },
  confirmAddExerciseButton: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: '#e0a800',
  },
  confirmAddExerciseText: {
    color: '#101316',
    fontWeight: '800',
  },
  exerciseCard: {
    backgroundColor: '#1a1f24',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a3138',
    overflow: 'hidden',
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  exerciseTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  suggestionSmall: {
    color: '#8f9aa5',
    fontSize: 11,
    marginTop: 3,
  },
  statusDone: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '800',
  },
  statusPending: {
    color: '#e0a800',
    fontSize: 12,
    fontWeight: '700',
  },
  setEditor: {
    borderTopWidth: 1,
    borderTopColor: '#2a3138',
    padding: 16,
    backgroundColor: '#15191d',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  setText: {
    color: '#8f9aa5',
    fontSize: 12,
    width: 40,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1f24',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a3138',
  },
  stepBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stepBtnText: {
    color: '#e0a800',
    fontSize: 16,
    fontWeight: '900',
  },
  stepVal: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 46,
    textAlign: 'center',
  },
  checkBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a3138',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101316',
  },
  checkBtnDone: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  checkBtnText: {
    color: '#fff',
    fontWeight: '900',
  },
  saveBtn: {
    backgroundColor: '#e0a800',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
    extraCard: {
    backgroundColor: '#1a1f24',
    padding: 16,
    borderRadius: 14,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#2a3138',
  },
  extraTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  extraRow: {
    flexDirection: 'row',
    gap: 12,
  },
  extraBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#222830',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a3138',
  },
  extraBtnActive: {
    backgroundColor: '#e0a800',
    borderColor: '#e0a800',
  },
  extraBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  extraForm: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#2a3138',
  },
  formLabel: {
    color: '#e0a800',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 9,
  },
  formInput: {
    backgroundColor: '#101316',
    borderWidth: 1,
    borderColor: '#2a3138',
    borderRadius: 9,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    marginBottom: 5,
  },
  activityChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 5,
  },
  activityChip: {
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 18,
    backgroundColor: '#222830',
    borderWidth: 1,
    borderColor: '#2a3138',
  },
  activityChipActive: {
    backgroundColor: '#e0a800',
    borderColor: '#e0a800',
  },
  activityChipText: {
    color: '#d0d5da',
    fontSize: 12,
    fontWeight: '600',
  },
  activityChipTextActive: {
    color: '#101316',
  },
  savedExtras: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a3138',
  },
  savedExtraText: {
    color: '#d0d5da',
    fontSize: 12,
    lineHeight: 20,
    marginTop: 4,
  },
  timerBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#e0a800',
    padding: 16,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  timerText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 16,
  },
  timerSkip: {
    color: '#000',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});