// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAVsREtbOF30frhPT9QAvQQ7s-Ekg3P4MQ",
  authDomain: "charity-event-checkin.firebaseapp.com",
  databaseURL: "https://charity-event-checkin-default-rtdb.firebaseio.com",
  projectId: "charity-event-checkin",
  storageBucket: "charity-event-checkin.firebasestorage.app",
  messagingSenderId: "422149994231",
  appId: "1:422149994231:web:9531f4d4b986b1ce78c5f2",
  measurementId: "G-Z5F8CGZGK6"
};

let database, auth;
let suppressFirebaseSave = false;
let firebaseReadyPromise = new Promise((resolve) => { window.firebaseReady = resolve; });

let syncState = {
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSync: null,
  pendingChanges: []
};

async function initializeFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    auth = firebase.auth();
    try { await auth.signInAnonymously(); } catch (e) { console.warn('Anonymous auth skipped/failed:', e); }
    console.log('✅ Firebase initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    return false;
  }
}

function toObjectById(items) {
  const obj = {};
  (items || []).forEach(item => { if (item && item.id) obj[item.id] = item; });
  return obj;
}

function fromObject(obj) {
  if (!obj) return [];
  return Object.values(obj).filter(Boolean);
}

function persistLocalAndRender() {
  if (typeof state === 'undefined') return;
  localStorage.setItem('checkin_pro', JSON.stringify(state));
  if (typeof renderCheckpoints === 'function') renderCheckpoints();
  if (typeof populateScanCheckpoints === 'function') populateScanCheckpoints();
  if (typeof renderParticipants === 'function') renderParticipants();
  if (typeof renderDashboard === 'function') renderDashboard();
}

function updateLastSyncDisplay() {
  const el = document.getElementById('last-sync');
  if (el && syncState.lastSync) el.textContent = `Synced ${syncState.lastSync.toLocaleTimeString()}`;
}

async function loadInitialStateFromFirebase() {
  if (!database || typeof state === 'undefined') return;
  try {
    const snapshot = await database.ref('appState').once('value');
    const data = snapshot.val();
    if (!data) {
      // First run: seed Firebase with current local state, if any.
      if (state && (state.event || state.participants.length || state.checkpoints.length || state.log.length)) {
        await saveStateToFirebase(state);
      }
      return;
    }

    suppressFirebaseSave = true;
    state.event = data.event || null;
    state.participants = fromObject(data.participants);
    state.checkpoints = fromObject(data.checkpoints);
    state.log = fromObject(data.checkins).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const nameInput = document.getElementById('event-name');
    const dateInput = document.getElementById('event-date');
    const descInput = document.getElementById('event-desc');
    const nameDisplay = document.getElementById('event-name-display');
    if (state.event) {
      if (nameInput) nameInput.value = state.event.name || '';
      if (dateInput) dateInput.value = state.event.date || '';
      if (descInput) descInput.value = state.event.desc || '';
      if (nameDisplay) nameDisplay.textContent = state.event.name || '';
    }
    persistLocalAndRender();
    suppressFirebaseSave = false;
    console.log('✅ Initial state loaded from Firebase');
  } catch (error) {
    suppressFirebaseSave = false;
    console.warn('⚠️ Could not load initial state from Firebase, using localStorage:', error);
  }
}

function startRealtimeSync() {
  if (!database || typeof state === 'undefined') return;
  database.ref('appState').on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data || suppressFirebaseSave) return;

    state.event = data.event || null;
    state.participants = fromObject(data.participants);
    state.checkpoints = fromObject(data.checkpoints);
    state.log = fromObject(data.checkins).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const nameDisplay = document.getElementById('event-name-display');
    if (nameDisplay && state.event) nameDisplay.textContent = state.event.name || '';
    persistLocalAndRender();
    syncState.lastSync = new Date();
    updateLastSyncDisplay();
    console.log('✅ Firebase realtime state received');
  }, (error) => console.error('❌ Firebase realtime sync error:', error));
}

async function saveStateToFirebase(appState) {
  if (!database || suppressFirebaseSave) return false;
  try {
    syncState.isSyncing = true;
    const payload = {
      event: appState.event || null,
      participants: toObjectById(appState.participants),
      checkpoints: toObjectById(appState.checkpoints),
      checkins: toObjectById((appState.log || []).map(entry => ({ ...entry, id: entry.id || `${entry.participantId}_${entry.checkpointId}_${entry.timestamp}` }))),
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    await database.ref('appState').set(payload);
    syncState.lastSync = new Date();
    updateLastSyncDisplay();
    console.log('✅ Full state saved to Firebase');
    return true;
  } catch (error) {
    console.error('❌ Error saving state to Firebase:', error);
    return false;
  } finally {
    syncState.isSyncing = false;
  }
}

async function saveParticipantToFirebase(participant) {
  if (!database || !participant || !participant.id) return false;
  try { await database.ref('appState/participants/' + participant.id).set(participant); return true; }
  catch (error) { console.error('❌ Error saving participant:', error); return false; }
}

async function deleteParticipantFromFirebase(id) {
  if (!database) return false;
  try { await database.ref('appState/participants/' + id).remove(); return true; }
  catch (error) { console.error('❌ Error deleting participant:', error); return false; }
}

async function saveCheckpointToFirebase(checkpoint) {
  if (!database || !checkpoint || !checkpoint.id) return false;
  try { await database.ref('appState/checkpoints/' + checkpoint.id).set(checkpoint); return true; }
  catch (error) { console.error('❌ Error saving checkpoint:', error); return false; }
}

async function deleteCheckpointFromFirebase(id) {
  if (!database) return false;
  try { await database.ref('appState/checkpoints/' + id).remove(); return true; }
  catch (error) { console.error('❌ Error deleting checkpoint:', error); return false; }
}

async function saveCheckInToFirebase(checkinData) {
  if (!database || !checkinData) return false;
  try {
    const entry = { ...checkinData, id: checkinData.id || database.ref('appState/checkins').push().key };
    await database.ref('appState/checkins/' + entry.id).set(entry);
    syncState.lastSync = new Date();
    updateLastSyncDisplay();
    console.log('✅ Check-in saved to Firebase:', entry);
    return true;
  } catch (error) {
    console.error('❌ Error saving check-in:', error);
    return false;
  }
}

async function clearLogFromFirebase() {
  if (!database) return false;
  try { await database.ref('appState/checkins').remove(); return true; }
  catch (error) { console.error('❌ Error clearing check-ins:', error); return false; }
}

// Backwards-compatible aliases used by older code paths
const logCheckinToFirebase = saveCheckInToFirebase;
const syncEvent = function(){};
const syncParticipants = function(){};
const syncCheckpoints = function(){};
const syncCheckIns = function(){};
const startPeriodicSync = function(){};
const stopPeriodicSync = function(){};

let broadcastChannel;
function initBroadcastChannel() {
  if ('BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('checkin_sync');
    broadcastChannel.onmessage = () => {};
  }
}
function broadcastCheckIn(checkinData) { if (broadcastChannel) broadcastChannel.postMessage({ type: 'checkin', checkin: checkinData }); }
function broadcastCheckpointAdded(checkpoint) { if (broadcastChannel) broadcastChannel.postMessage({ type: 'checkpoint_added', checkpoint }); }
function broadcastCheckpointDeleted(id) { if (broadcastChannel) broadcastChannel.postMessage({ type: 'checkpoint_deleted', id }); }

window.addEventListener('online', async () => {
  syncState.isOnline = true;
  if (typeof state !== 'undefined') await saveStateToFirebase(state);
});
window.addEventListener('offline', () => { syncState.isOnline = false; });

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing Firebase Sync...');
  const ready = await initializeFirebase();
  initBroadcastChannel();
  if (ready) {
    await loadInitialStateFromFirebase();
    startRealtimeSync();
    window.firebaseReady(true);
    const statusEl = document.getElementById('firebase-status');
    if (statusEl) { statusEl.textContent = '🟢 Firebase connected'; statusEl.style.color = 'var(--accent3)'; }
  } else {
    window.firebaseReady(false);
    const statusEl = document.getElementById('firebase-status');
    if (statusEl) { statusEl.textContent = '🔴 Offline (local only)'; statusEl.style.color = 'var(--accent2)'; }
  }
});
