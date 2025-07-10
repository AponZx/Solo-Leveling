import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCpC6yIq35WhvyfB-Wjn2IrPI6cOEgzNXg",
  authDomain: "solo-leveling-official.firebaseapp.com",
  projectId: "solo-leveling-official",
  storageBucket: "solo-leveling-official.appspot.com",
  messagingSenderId: "967613695471",
  appId: "1:967613695471:web:ac3ccacc357ff5de74a21a",
  measurementId: "G-12J14N1B8Q"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const music = document.getElementById("bgMusic");
const musicToggle = document.getElementById("musicToggle");
musicToggle.onclick = () => {
  music.muted = !music.muted;
  musicToggle.textContent = music.muted ? "🔇" : "🔊";
};

const email = document.getElementById("email");
const password = document.getElementById("password");
const authSection = document.getElementById("auth");
const dashSection = document.getElementById("dash");

const xpEl = document.getElementById("xp");
const nextXpEl = document.getElementById("nextXp");
const questsDoneEl = document.getElementById("questsDone");
const rankBadge = document.getElementById("rankBadge");
const questBoard = document.getElementById("questBoard");

const hunterNameInput = document.getElementById("hunterNameInput");
const saveHunterNameBtn = document.getElementById("saveHunterNameBtn");

const leaderboardBody = document.getElementById("leaderboard-body");

let currentUser = null;
let userData = null;
let taskInProgress = false;

const ranks = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS", "Legend"];
const xpSteps = [100, 200, 400, 700, 1000, 1500, 2500, 4000, 6000, 9999];

// Simple bad words filter (expand as needed)
const bannedWords = ["badword1", "badword2", "idiot", "stupid"];

function getRank(xp) {
  let total = 0;
  for (let i = 0; i < xpSteps.length; i++) {
    total += xpSteps[i];
    if (xp < total) return { rank: ranks[i], required: xpSteps[i] };
  }
  return { rank: "Legend", required: 9999 };
}

window.register = () => {
  createUserWithEmailAndPassword(auth, email.value, password.value)
    .then(async (cred) => {
      const userRef = doc(db, "users", cred.user.uid);
      await setDoc(userRef, {
        xp: 0,
        rank: "F",
        questsDone: 0,
        lastActive: new Date().toISOString(),
        completedTasks: {},
        hunterName: "Hunter"  // default name
      });
    })
    .catch(e => alert(e.message));
};

window.login = () => {
  signInWithEmailAndPassword(auth, email.value, password.value)
    .catch(e => alert(e.message));
};

window.logout = () => {
  signOut(auth);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    userData = snap.data();

    // Set hunter name input value or default
    hunterNameInput.value = userData.hunterName || "Hunter";

    await refreshDailyTasks();
    updateUI();
    loadLeaderboard();

    // Set avatar and rank badge
    const rankData = getRank(userData.xp);
    setAvatarByRank(rankData.rank);

    authSection.classList.add("hidden");
    dashSection.classList.remove("hidden");
  } else {
    authSection.classList.remove("hidden");
    dashSection.classList.add("hidden");
    currentUser = null;
    userData = null;
    hunterNameInput.value = "";
  }
});

// Save Hunter Name
saveHunterNameBtn.onclick = async () => {
  const newName = hunterNameInput.value.trim();

  // Validation
  if (newName.length === 0) {
    alert("Hunter name cannot be empty!");
    return;
  }
  if (newName.length > 12) {
    alert("Hunter name cannot be longer than 12 characters.");
    return;
  }
  // Check banned words (case insensitive)
  const lowerName = newName.toLowerCase();
  for (const word of bannedWords) {
    if (lowerName.includes(word)) {
      alert("Your hunter name contains inappropriate language.");
      return;
    }
  }

  // Save to Firestore
  const userRef = doc(db, "users", currentUser.uid);
  await updateDoc(userRef, { hunterName: newName });
  userData.hunterName = newName;
  alert("Hunter name saved!");
  loadLeaderboard(); // refresh leaderboard names
};

// Generate tasks based on XP
function generateQuests(xp) {
  const easyTasks = [
    { id: "meditation", text: "🧘 10-second meditation", duration: 10, xp: 5 },
    { id: "jumping_jacks", text: "🤸 10 jumping jacks", duration: 10, xp: 10 },
    { id: "squats", text: "🦵 10 squats", duration: 12, xp: 12 },
    { id: "run_30sec", text: "🏃 Run for 30 sec", duration: 30, xp: 15 }
  ];
  const mediumTasks = [
    { id: "climb_stairs", text: "🧗 Climb 40 stairs", duration: 40, xp: 20 },
    { id: "pushups_20", text: "💪 20 push-ups", duration: 25, xp: 25 },
    { id: "run_5min", text: "🏃 Run for 5 minutes", duration: 300, xp: 35 },
    { id: "plank_60", text: "🧎 60-second plank", duration: 60, xp: 30 }
  ];
  const hardTasks = [
    { id: "jumping_jacks_100", text: "🏋️ 100 jumping jacks", duration: 100, xp: 50 },
    { id: "wall_sit", text: "🧱 Wall sit for 2 minutes", duration: 120, xp: 60 },
    { id: "run_2km", text: "💥 2 km run", duration: 600, xp: 70 },
    { id: "squats_150", text: "🥵 150 squats", duration: 180, xp: 80 }
  ];

  const all = xp < 300 ? easyTasks : xp < 1000 ? mediumTasks : hardTasks;
  return shuffle([...all]).slice(0, 8);
}

function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

async function refreshDailyTasks() {
  const today = new Date().toISOString().slice(0, 10);
  if (!userData.dailyTaskDate || userData.dailyTaskDate !== today) {
    userData.dailyTaskDate = today;
    userData.dailyTasks = generateQuests(userData.xp);
    userData.completedTasks = {};
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
      dailyTaskDate: today,
      dailyTasks: userData.dailyTasks,
      completedTasks: {}
    });
  }
}

function updateUI() {
  const { xp, questsDone, dailyTasks, completedTasks } = userData;
  const rankData = getRank(xp);
  const rankIndex = ranks.indexOf(rankData.rank);

  let totalBefore = 0;
  for (let i = 0; i < rankIndex; i++) {
    totalBefore += xpSteps[i];
  }

  const relativeXp = xp - totalBefore;
  const xpToNext = xpSteps[rankIndex];

  // Update XP and Rank Display
  xpEl.textContent = `${relativeXp}`;
  nextXpEl.textContent = `${xpToNext}`;
  questsDoneEl.textContent = questsDone || 0;

  // Update rank badge with icon
  rankBadge.innerHTML = `<div class="rank-icon ${rankData.rank.toLowerCase()}"></div>`;
  rankBadge.style.background = 'transparent';

  // Update avatar based on current rank
  setAvatarByRank(rankData.rank);

  // XP progress bar
  const xpBarText = document.getElementById("xp-progress-text");
  const xpBarFill = document.getElementById("xp-bar-fill");
  xpBarText.textContent = `XP: ${relativeXp} / ${xpToNext} to next rank`;
  const progressPercent = Math.min((relativeXp / xpToNext) * 100, 100);
  xpBarFill.style.width = `${progressPercent}%`;

  // Display daily quests
  questBoard.innerHTML = "";
  dailyTasks.forEach((task) => {
    const li = document.createElement("li");
    const isCompleted = completedTasks[task.id];
    li.innerHTML = `
      <span class="${isCompleted ? 'completed-task' : ''}">${task.text}</span>
      <div>
        ${isCompleted ? '<button disabled>Completed</button>' : `<button onclick="startTask('${task.id}', ${task.duration}, ${task.xp}, this)">Start</button>`}
        <span class="timer"></span>
      </div>
    `;
    questBoard.appendChild(li);
  });
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

window.startTask = (taskId, duration, xpReward, btn) => {
  if (taskInProgress) return alert("Finish the current task first!");

  taskInProgress = true;
  const parent = btn.parentElement;
  const timerSpan = parent.querySelector(".timer");
  btn.style.display = "none";

  let time = duration;
  timerSpan.textContent = formatTime(time);

  const interval = setInterval(() => {
    time--;
    timerSpan.textContent = formatTime(time);
    if (time <= 0) {
      clearInterval(interval);
      const completeBtn = document.createElement("button");
      completeBtn.textContent = "Complete";
      completeBtn.onclick = async () => {
        const userRef = doc(db, "users", currentUser.uid);
        userData.xp += xpReward;
        userData.questsDone = (userData.questsDone || 0) + 1;
        userData.completedTasks[taskId] = true;

        await updateDoc(userRef, {
          xp: userData.xp,
          questsDone: userData.questsDone,
          completedTasks: userData.completedTasks
        });
        taskInProgress = false;
        updateUI();
        loadLeaderboard();
      };
      parent.appendChild(completeBtn);
      timerSpan.remove();
    }
  }, 1000);
};

function setAvatarByRank(rank) {
  const avatar = document.getElementById('user-avatar');
  if (!avatar) return;
  avatar.className = 'avatar';
  const rankLower = rank.toLowerCase();
  const allowed = ['f','e','d','c','b','a','s','ss','sss','legend'];
  if (allowed.includes(rankLower)) {
    avatar.classList.add(rankLower);
  } else {
    avatar.classList.add('f');
  }
}

// Load leaderboard top 10
async function loadLeaderboard() {
  leaderboardBody.innerHTML = "";

  const usersRef = collection(db, "users");
  const q = query(usersRef, orderBy("xp", "desc"), limit(10));
  const querySnapshot = await getDocs(q);

  let position = 1;
  querySnapshot.forEach(docSnap => {
    const u = docSnap.data();
    const rankData = getRank(u.xp || 0);
    const rankLower = rankData.rank.toLowerCase();
    const hunterName = u.hunterName || "Hunter";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${position}</td>
      <td><img src="${rankLower}.png" alt="Avatar ${rankLower}" /></td>
      <td>${escapeHTML(hunterName)}</td>
      <td><div class="rank-icon ${rankLower}"></div></td>
      <td>${u.xp || 0}</td>
    `;
    leaderboardBody.appendChild(tr);
    position++;
  });
}

// Simple escape to prevent HTML injection in hunter names
function escapeHTML(text) {
  return text.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}