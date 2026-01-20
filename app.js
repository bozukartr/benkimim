import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, getDoc, collection, query, where, getDocs, updateDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAK84aCbRN43wSZT5cBHemtnEFTnBd8JD4",
    authDomain: "benkimim-b0fd0.firebaseapp.com",
    projectId: "benkimim-b0fd0",
    storageBucket: "benkimim-b0fd0.firebasestorage.app",
    messagingSenderId: "277402812678",
    appId: "1:277402812678:web:21dc64846663f042db5e87",
    measurementId: "G-HLRECP1XC4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let currentRoomId = null;
let myPlayerId = null;
let myChoice = null;
let currentRoomStatus = null;

if (!sessionStorage.getItem('guessWhoSessionId')) {
    sessionStorage.setItem('guessWhoSessionId', 'sess_' + Math.random().toString(36).substr(2, 9));
}
const mySessionId = sessionStorage.getItem('guessWhoSessionId');

const CHARACTERS = Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    name: `Suspect ${i + 1}`,
    image: `assets/${i + 1}.jpg`
}));

const screens = {
    login: document.getElementById('screen-login'),
    lobby: document.getElementById('screen-lobby'),
    choice: document.getElementById('screen-choice'),
    game: document.getElementById('screen-game')
};

const selectionGrid = document.getElementById('selection-grid');
const gameGrid = document.getElementById('game-grid');
const gameStatusLabel = document.getElementById('game-status');
const myChoiceMini = document.getElementById('my-choice-mini');
const oppNameLabel = document.getElementById('opp-name');
const modalResult = document.getElementById('modal-result');

const btns = {
    play: document.getElementById('btn-play'),
    cancel: document.getElementById('btn-cancel'),
    confirmChoice: document.getElementById('btn-confirm-choice'),
    makeGuess: document.getElementById('btn-make-guess'),
    restart: document.getElementById('btn-restart')
};

async function init() {
    try {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
    } catch (err) { console.error(err); }
}

function showScreen(id) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[id].classList.add('active');
}

async function findGame() {
    const name = document.getElementById('username').value.trim() || "AGENT";
    showScreen('lobby');

    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("status", "==", "waiting"), where("player2", "==", null));

    try {
        const snap = await getDocs(q);
        const available = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(r => r.player1Session !== mySessionId)
            .sort((a, b) => b.createdAt - a.createdAt);

        if (available.length > 0) {
            const r = available[0];
            currentRoomId = r.id;
            myPlayerId = 'player2';
            await updateDoc(doc(db, "rooms", currentRoomId), {
                player2: currentUser.uid,
                player2Name: name,
                player2Session: mySessionId,
                status: 'choosing'
            });
        } else {
            currentRoomId = `room_${Date.now()}`;
            myPlayerId = 'player1';
            await setDoc(doc(db, "rooms", currentRoomId), {
                player1: currentUser.uid,
                player1Name: name,
                player1Session: mySessionId,
                player2: null,
                status: 'waiting',
                choices: {},
                guesses: {},
                createdAt: Date.now()
            });
        }
        listenToRoom();
    } catch (e) { showScreen('login'); }
}

function listenToRoom() {
    onSnapshot(doc(db, "rooms", currentRoomId), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        if (data.status === 'cancelled') {
            window.location.reload();
            return;
        }

        if (data.status === currentRoomStatus) return;
        currentRoomStatus = data.status;

        if (data.status === 'choosing') {
            setupSelectionGrid();
            showScreen('choice');
        }

        if (data.status === 'playing') {
            setupGameGrid();
            showScreen('game');
            oppNameLabel.textContent = (myPlayerId === 'player1' ? (data.player2Name) : (data.player1Name)) || "TARGET";
            const cId = data.choices[myPlayerId];
            if (cId) {
                const char = CHARACTERS.find(c => c.id === cId);
                myChoiceMini.style.backgroundImage = `url(${char.image})`;
            }
        }

        if (data.status === 'ended') {
            const oppId = myPlayerId === 'player1' ? 'player2' : 'player1';
            const oppChoice = data.choices[oppId];
            const iWon = data.winners && data.winners.includes(mySessionId);
            showFinalResult(iWon, oppChoice);
        }

        if (data.status === 'finalizing' && data.guesses[mySessionId]) {
            gameStatusLabel.textContent = "WAITING...";
            btns.makeGuess.disabled = true;
            btns.makeGuess.textContent = "LOCKED";
        }
    });
}

function setupSelectionGrid() {
    selectionGrid.innerHTML = '';
    CHARACTERS.forEach(c => {
        const el = document.createElement('div');
        el.className = 'floating-tile';
        el.innerHTML = `<img src="${c.image}">`;
        el.onclick = () => {
            document.querySelectorAll('#selection-grid .floating-tile').forEach(t => t.classList.remove('selected'));
            el.classList.add('selected');
            myChoice = c.id;
            btns.confirmChoice.disabled = false;
        };
        selectionGrid.appendChild(el);
    });
}

function setupGameGrid() {
    gameGrid.innerHTML = '';
    CHARACTERS.forEach(c => {
        const el = document.createElement('div');
        el.className = 'floating-tile';
        el.innerHTML = `<img src="${c.image}">`;
        el.onclick = () => {
            const isDown = el.classList.contains('down');
            const remaining = document.querySelectorAll('#game-grid .floating-tile:not(.down)').length;

            // If it's the last one standing, don't allow flipping it DOWN.
            // But always allow flipping it back UP if it's already down.
            if (!isDown && remaining <= 1) return;

            el.classList.toggle('down');
            updateSuspectCount();
        };
        gameGrid.appendChild(el);
    });
}

function updateSuspectCount() {
    const downCount = document.querySelectorAll('#game-grid .floating-tile.down').length;
    const rem = CHARACTERS.length - downCount;
    gameStatusLabel.textContent = `${rem} SUSPECTS`;
    btns.makeGuess.disabled = rem !== 1;
}

async function confirmIdentity() {
    btns.confirmChoice.disabled = true;
    const roomRef = doc(db, "rooms", currentRoomId);
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(roomRef);
            const data = snap.data();
            const newChoices = { ...data.choices, [myPlayerId]: myChoice };
            const updates = { choices: newChoices };
            if (Object.keys(newChoices).length === 2) updates.status = 'playing';
            tx.update(roomRef, updates);
        });
    } catch (e) { btns.confirmChoice.disabled = false; }
}

async function handleFinalGuess() {
    const lastTile = Array.from(document.querySelectorAll('#game-grid .floating-tile')).find(t => !t.classList.contains('down'));
    const imgUrl = lastTile.querySelector('img').src;
    const guessed = CHARACTERS.find(c => imgUrl.includes(c.image));
    const roomRef = doc(db, "rooms", currentRoomId);

    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(roomRef);
            const data = snap.data();
            const newGuesses = { ...data.guesses, [mySessionId]: guessed.id };
            const updates = { guesses: newGuesses, status: 'finalizing' };

            if (Object.keys(newGuesses).length === 2) {
                const winners = [];
                if (newGuesses[data.player1Session] === data.choices.player2) winners.push(data.player1Session);
                if (newGuesses[data.player2Session] === data.choices.player1) winners.push(data.player2Session);
                updates.status = 'ended';
                updates.winners = winners;
            }
            tx.update(roomRef, updates);
        });
    } catch (e) { console.error(e); }
}

function showFinalResult(win, oppChoiceId) {
    const opp = CHARACTERS.find(c => c.id === oppChoiceId);
    document.getElementById('result-title').textContent = win ? "MISSION SUCCESS" : "MISSION FAILED";
    document.getElementById('result-msg').textContent = win ? "Target neutralized correctly." : "The suspect escaped your radar.";
    document.getElementById('reveal-opp').style.backgroundImage = `url(${opp.image})`;
    modalResult.classList.add('active');
}

btns.play.onclick = findGame;
btns.cancel.onclick = () => window.location.reload();
btns.confirmChoice.onclick = confirmIdentity;
btns.makeGuess.onclick = handleFinalGuess;
btns.restart.onclick = () => window.location.reload();

init();
