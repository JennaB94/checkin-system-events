// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
let firebaseReadyPromise = new Promise((resolve) => {
  window.firebaseReady = resolve;
});
let database, auth;

async function initializeFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    auth = firebase.auth();
    
    console.log('✅ Firebase initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    return false;
  }
}

// ============================================================
// STATE MANAGEMENT & SYNC LISTENERS
// ============================================================

let syncState = {
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSync: null,
  pendingChanges: []
};

// Local deletion guards prevent recently deleted items from being re-added by
// a delayed Firebase child_added/value event during page refresh or sync.
const deletedLocally = {
  participants: new Set(JSON.parse(localStorage.getItem('deleted_participants') || '[]')),
  checkpoints: new Set(JSON.parse(localStorage.getItem('deleted_checkpoints') || '[]')),
  checkinsClearedAt: Number(localStorage.getItem('checkins_cleared_at') || 0),
  eventDeleted: localStorage.getItem('event_deleted') === 'true'
};

function rememberDeleted(type, id) {
  if (!deletedLocally[type]) return;
  deletedLocally[type].add(id);
  localStorage.setItem(type === 'participants' ? 'deleted_participants' : 'deleted_checkpoints', JSON.stringify([...deletedLocally[type]]));
}

function forgetDeleted(type, id) {
  if (!deletedLocally[type]) return;
  deletedLocally[type].delete(id);
  localStorage.setItem(type === 'participants' ? 'deleted_participants' : 'deleted_checkpoints', JSON.stringify([...deletedLocally[type]]));
}

function markCheckinsCleared() {
  deletedLocally.checkinsClearedAt = Date.now();
  localStorage.setItem('checkins_cleared_at', String(deletedLocally.checkinsClearedAt));
}

function markEventDeleted() {
  deletedLocally.eventDeleted = true;
  localStorage.setItem('event_deleted', 'true');
}

function markEventSaved() {
  deletedLocally.eventDeleted = false;
  localStorage.removeItem('event_deleted');
}

// Real-time sync for Check-ins (shared live dashboard across devices)
function syncCheckIns(callback) {
  if (!database) return;

  const checkinsRef = database.ref('checkins');

  // Use a full value listener rather than child_added only. This means that
  // clearing logs on one device immediately clears them on every other device.
  checkinsRef.orderByChild('timestamp').on('value', (snapshot) => {
    if (typeof state === 'undefined' || !state) return;

    const data = snapshot.val() || {};
    const checkins = Object.values(data)
      .filter(Boolean)
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    state.log = checkins;
    localStorage.setItem('checkin_pro', JSON.stringify(state));

    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof callback === 'function') callback(checkins);
  }, (error) => {
    console.error('❌ Check-ins sync error:', error);
  });
}

// Real-time sync for Event
function syncEvent() {
  if (!database) return;

  const nameInput = document.getElementById('event-name');
  const dateInput = document.getElementById('event-date');
  const descInput = document.getElementById('event-desc');
  const nameDisplay = document.getElementById('event-name-display');

  database.ref('event').on('value', (snapshot) => {
    const data = snapshot.val();
    if (typeof state === 'undefined') return;
    if (!data) {
      state.event = null;
      localStorage.setItem('checkin_pro', JSON.stringify(state));
      if (nameInput) nameInput.value = '';
      if (dateInput) dateInput.value = '';
      if (descInput) descInput.value = '';
      if (nameDisplay) nameDisplay.textContent = 'No event set up';
      return;
    }
    if (data && !deletedLocally.eventDeleted) {
      state.event = data;
      localStorage.setItem('checkin_pro', JSON.stringify(state));
      
      // ALWAYS update inputs (remove the !== check)
      if (nameInput) nameInput.value = data.name || '';
      if (dateInput) dateInput.value = data.date || '';
      if (descInput) descInput.value = data.desc || '';
      if (nameDisplay) nameDisplay.textContent = data.name || '';
      
      console.log('✅ Event synced from Firebase:', data.name);
    }
  }, (error) => {
    console.error('❌ Event sync error:', error);
  });
}

// Real-time sync for Participants
function syncParticipants() {
  if (!database) return;

  database.ref('participants').on('value', (snapshot) => {
    if (typeof state === 'undefined' || !state) return;
    const data = snapshot.val() || {};
    state.participants = Object.values(data).filter(p => p && p.id);
    localStorage.setItem('checkin_pro', JSON.stringify(state));
    if (typeof renderParticipants === 'function') renderParticipants();
  }, (error) => {
    console.error('❌ Participants sync error:', error);
  });
}

// Real-time sync for Checkpoints
function syncCheckpoints() {
  if (!database) return;

  database.ref('checkpoints').on('value', (snapshot) => {
    if (typeof state === 'undefined' || !state) return;
    const data = snapshot.val() || {};
    state.checkpoints = Object.values(data).filter(c => c && c.id);
    localStorage.setItem('checkin_pro', JSON.stringify(state));
    if (typeof renderCheckpoints === 'function') renderCheckpoints();
    if (typeof populateScanCheckpoints === 'function') populateScanCheckpoints();
    if (typeof renderDashboard === 'function') renderDashboard();
  }, (error) => {
    console.error('❌ Checkpoints sync error:', error);
  });
}

// ============================================================
// INITIAL STATE LOAD FROM FIREBASE
// ============================================================

// Load the complete state from Firebase on page load (falls back to localStorage)
async function loadInitialStateFromFirebase() {
  if (!database || typeof state === 'undefined') return;
  try {
    const snapshot = await database.ref().once('value');
    const data = snapshot.val();
    if (!data) return;

    if (data.event && !deletedLocally.eventDeleted) {
      state.event = data.event;
      const nameInput = document.getElementById('event-name');
      const dateInput = document.getElementById('event-date');
      const descInput = document.getElementById('event-desc');
      const nameDisplay = document.getElementById('event-name-display');
      if (nameInput) nameInput.value = data.event.name || '';
      if (dateInput) dateInput.value = data.event.date || '';
      if (descInput) descInput.value = data.event.desc || '';
      if (nameDisplay) nameDisplay.textContent = data.event.name || '';
    }

    state.participants = data.participants
      ? Object.values(data.participants).filter(p => p && p.id && !deletedLocally.participants.has(p.id))
      : [];
    if (typeof renderParticipants === 'function') renderParticipants();

    state.checkpoints = data.checkpoints
      ? Object.values(data.checkpoints).filter(c => c && c.id && !deletedLocally.checkpoints.has(c.id))
      : [];
    if (typeof renderCheckpoints === 'function') renderCheckpoints();
    if (typeof populateScanCheckpoints === 'function') populateScanCheckpoints();

    state.log = data.checkins
      ? Object.values(data.checkins).filter(checkin => {
          if (!checkin || !checkin.id) return false;
          if (!deletedLocally.checkinsClearedAt) return true;
          const t = Number(checkin.timestamp || new Date(checkin.time || checkin.syncedAt || 0).getTime());
          return t > deletedLocally.checkinsClearedAt;
        })
      : [];
    if (typeof renderDashboard === 'function') renderDashboard();

    localStorage.setItem('checkin_pro', JSON.stringify(state));
    console.log('✅ Initial state loaded from Firebase');
  } catch (error) {
    console.warn('⚠️ Could not load initial state from Firebase, using localStorage:', error);
  }
}

// ============================================================
// WRITE OPERATIONS - PUSHING DATA TO FIREBASE
// ============================================================

// Save only event-level app state to Firebase.
// Participants, checkpoints and check-ins are saved item-by-item below so one
// device cannot overwrite another device's newer data with stale localStorage.
async function saveStateToFirebase(appState) {
  if (!database) return false;
  try {
    if (appState && Object.prototype.hasOwnProperty.call(appState, 'event')) {
      await database.ref('event').set(appState.event || null);
    }
    syncState.lastSync = new Date();
    updateLastSyncDisplay();
    return true;
  } catch (error) {
    console.error('❌ Error saving app state to Firebase:', error);
    return false;
  }
}

// Save one participant to Firebase
async function saveParticipantToFirebase(participant) {
  if (participant && participant.id) forgetDeleted('participants', participant.id);
  if (!database) {
    syncState.pendingChanges.push({ type: 'participant_add', data: participant });
    return false;
  }
  try {
    await database.ref('participants/' + participant.id).set(participant);
    syncState.lastSync = new Date();
    updateLastSyncDisplay();
    return true;
  } catch (error) {
    console.error('❌ Error saving participant to Firebase:', error);
    syncState.pendingChanges.push({ type: 'participant_add', data: participant });
    return false;
  }
}

// Update the "last sync" display in the UI
function updateLastSyncDisplay() {
  const el = document.getElementById('last-sync');
  if (el && syncState.lastSync) {
    el.textContent = `Synced ${syncState.lastSync.toLocaleTimeString()}`;
  }
}

// Clear all check-ins from Firebase
async function clearCheckInsFromFirebase() {
  markCheckinsCleared();
  if (!database) return;
  try {
    database.ref('checkins').off();
    await database.ref('checkins').remove();
    console.log('✅ Check-ins cleared from Firebase');
  } catch (error) {
    console.error('❌ Error clearing check-ins from Firebase:', error);
  }
}

// Periodic sync: re-push local state to Firebase every 30 seconds as a fallback
let periodicSyncIntervalId = null;

function startPeriodicSync() {
  if (periodicSyncIntervalId !== null) return;
  periodicSyncIntervalId = setInterval(async () => {
    if (!database || typeof state === 'undefined' || syncState.isSyncing) return;
    syncState.isSyncing = true;
    try {
      await saveStateToFirebase(state);
      console.log('🔄 Periodic sync complete');
    } catch (error) {
      console.error('❌ Periodic sync failed:', error);
    } finally {
      syncState.isSyncing = false;
    }
  }, 30000);
}

function stopPeriodicSync() {
  if (periodicSyncIntervalId !== null) {
    clearInterval(periodicSyncIntervalId);
    periodicSyncIntervalId = null;
  }
}

window.addEventListener('beforeunload', stopPeriodicSync);

// Delete a participant from Firebase by ID
async function deleteParticipantFromFirebase(id) {
  rememberDeleted('participants', id);
  if (!database) return;
  try {
    await database.ref('participants/' + id).remove();
    console.log('✅ Participant removed from Firebase:', id);
  } catch (error) {
    console.error('❌ Error removing participant from Firebase:', error);
  }
}

// Save a single checkpoint to Firebase by ID
async function saveCheckpointToFirebase(checkpoint) {
  if (checkpoint && checkpoint.id) forgetDeleted('checkpoints', checkpoint.id);
  if (!database) {
    syncState.pendingChanges.push({ type: 'checkpoint_add', data: checkpoint });
    return false;
  }
  try {
    await database.ref('checkpoints/' + checkpoint.id).set(checkpoint);
    console.log('✅ Checkpoint saved to Firebase:', checkpoint.id);
    return true;
  } catch (error) {
    console.error('❌ Error saving checkpoint to Firebase:', error);
    syncState.pendingChanges.push({ type: 'checkpoint_add', data: checkpoint });
    return false;
  }
}

// Delete a checkpoint from Firebase by ID
async function deleteCheckpointFromFirebase(id) {
  rememberDeleted('checkpoints', id);
  if (!database) {
    syncState.pendingChanges.push({ type: 'checkpoint_delete', data: id });
    return false;
  }
  try {
    await database.ref('checkpoints/' + id).remove();
    console.log('✅ Checkpoint removed from Firebase:', id);
    return true;
  } catch (error) {
    console.error('❌ Error removing checkpoint from Firebase:', error);
    syncState.pendingChanges.push({ type: 'checkpoint_delete', data: id });
    return false;
  }
}

// Save Check-in (CRITICAL - Real-time updates)
async function saveCheckInToFirebase(checkinData) {
  try {
    if (!database) throw new Error('Firebase not initialized');

    syncState.isSyncing = true;
    const id = checkinData.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
    const payload = {
      ...checkinData,
      id,
      timestamp: checkinData.timestamp || firebase.database.ServerValue.TIMESTAMP,
      syncedAt: new Date().toISOString()
    };

    await database.ref('checkins/' + id).set(payload);
    console.log('✅ Check-in saved to Firebase:', payload);
    syncState.lastSync = new Date();
    syncState.isSyncing = false;
    updateLastSyncDisplay();
    return true;
  } catch (error) {
    console.error('❌ Error saving check-in:', error);
    syncState.isSyncing = false;
    syncState.pendingChanges.push({ type: 'checkin', data: checkinData });
    return false;
  }
}

// Backwards-compatible names used by index.html/scanner-fix.js
const logCheckinToFirebase = async function(participantId, checkpointId) {
  if (typeof state === 'undefined') return false;
  const p = state.participants.find(x => x.id === participantId);
  const cp = state.checkpoints.find(x => x.id === checkpointId);
  if (!p || !cp) return false;
  return saveCheckInToFirebase({
    id: (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase(),
    participantId: p.id,
    participantName: p.name,
    participantGroup: p.group || 'General',
    checkpointId: cp.id,
    checkpointName: cp.name,
    timestamp: Date.now()
  });
};

const clearLogFromFirebase = clearCheckInsFromFirebase;

// ============================================================
// OFFLINE/ONLINE HANDLING
// ============================================================

window.addEventListener('online', async () => {
  console.log('🌐 Back online! Syncing pending changes...');
  syncState.isOnline = true;
  
  if (syncState.pendingChanges.length > 0) {
    const pending = [...syncState.pendingChanges];
    syncState.pendingChanges = [];
    for (const change of pending) {
      try {
        if (change.type === 'checkin') await saveCheckInToFirebase(change.data);
        else if (change.type === 'participant_add') await saveParticipantToFirebase(change.data);
        else if (change.type === 'checkpoint_add') await saveCheckpointToFirebase(change.data);
        else if (change.type === 'checkpoint_delete') await deleteCheckpointFromFirebase(change.data);
      } catch (error) {
        console.error('Error syncing pending change:', error);
      }
    }
    if (typeof toast === 'function') {
      toast('✅ All changes synced!', 'success');
    }
  }

  // Push full local state to Firebase after coming back online
  if (typeof state !== 'undefined') {
    await saveStateToFirebase(state);
  }
});

window.addEventListener('offline', () => {
  console.log('⚠️ You are offline. Changes will be synced when back online.');
  syncState.isOnline = false;
  if (typeof toast === 'function') {
    toast('⚠️ Offline mode - changes will sync when online', 'warning');
  }
});

// ============================================================
// BROADCAST CHANNEL FOR MULTI-TAB SYNC
// ============================================================

let broadcastChannel;

function initBroadcastChannel() {
  if ('BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('checkin_sync');
    
    broadcastChannel.onmessage = (event) => {
      console.log('📡 Received message from other tab:', event.data);
      
      if (event.data.type === 'checkin' && typeof state !== 'undefined') {
        if (!state.log.find(e => e.id === event.data.checkin.id)) {
          state.log.push(event.data.checkin);
          localStorage.setItem('checkin_pro', JSON.stringify(state));
        }
        if (typeof renderDashboard === 'function') {
          renderDashboard();
        }
      }

      if (event.data.type === 'checkpoint_added' && typeof state !== 'undefined') {
        if (!state.checkpoints.find(c => c.id === event.data.checkpoint.id)) {
          state.checkpoints.push(event.data.checkpoint);
          localStorage.setItem('checkin_pro', JSON.stringify(state));
          if (typeof renderCheckpoints === 'function') renderCheckpoints();
          if (typeof populateScanCheckpoints === 'function') populateScanCheckpoints();
        }
      }

      if (event.data.type === 'checkpoint_deleted' && typeof state !== 'undefined') {
        state.checkpoints = state.checkpoints.filter(c => c.id !== event.data.id);
        localStorage.setItem('checkin_pro', JSON.stringify(state));
        if (typeof renderCheckpoints === 'function') renderCheckpoints();
        if (typeof populateScanCheckpoints === 'function') populateScanCheckpoints();
      }
    };
    
    console.log('✅ Broadcast Channel initialized for multi-tab sync');
  }
}

function broadcastCheckIn(checkinData) {
  if (broadcastChannel) {
    broadcastChannel.postMessage({
      type: 'checkin',
      checkin: checkinData
    });
  }
}

function broadcastCheckpointAdded(checkpoint) {
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'checkpoint_added', checkpoint });
  }
}

function broadcastCheckpointDeleted(id) {
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'checkpoint_deleted', id });
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing Firebase Sync...');
  
  const firebaseReady = await initializeFirebase();
  initBroadcastChannel();
  
  if (firebaseReady) {
    await loadInitialStateFromFirebase();

    syncEvent();

    syncCheckIns();

    syncParticipants();
    syncCheckpoints();
    
    // Do not periodically push full localStorage state; Firebase listeners are the source of truth.
    console.log('✅ Real-time sync listeners activated');
    window.firebaseReady(true);
    const statusEl = document.getElementById('firebase-status');
    if (statusEl) {
      statusEl.textContent = '🟢 Firebase connected';
      statusEl.style.color = 'var(--accent3)';
    }
  } else {
    console.warn('⚠️ Firebase not available - using local storage only');
    window.firebaseReady(false);
    const statusEl = document.getElementById('firebase-status');
    if (statusEl) {
      statusEl.textContent = '🔴 Offline (local only)';
      statusEl.style.color = 'var(--accent2)';
    }
  }
});

// Expose deletion helpers for index.html
window.markEventDeleted = markEventDeleted;
window.markEventSaved = markEventSaved;
window.markCheckinsCleared = markCheckinsCleared;
window.rememberDeleted = rememberDeleted;

window.saveParticipantToFirebase = saveParticipantToFirebase;
window.saveCheckInToFirebase = saveCheckInToFirebase;
window.logCheckinToFirebase = logCheckinToFirebase;
window.clearLogFromFirebase = clearLogFromFirebase;
