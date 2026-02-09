// =====================
// 初期データ生成関数
// =====================
function createInitialGameData() {
  return {
    horse: {
      name: "ななしの馬",
      speed: 1000,
      acceleration: 0,
      stamina: 0
    },
    status: {
      energy: 100,
      mood: 50,
      fullness: 100
    },
    training: {
      difficulty: 2   // ★ デフォルト難易度
    },
    progress: {
      totalRunDistance: 0,
      currentRunDistance: 0,
      runSpeedHistory: [],

      // ★ 追加：実走ルート保存
      savedRunRoute: []
    },
    time: {
      lastAccess: Date.now(),
      lastFeed: 0,
      feedCountToday: 0,
      moodDayKey: null,
      lastRunStart: 0,       // ★ 追加：実走開始時刻
      lastRunDayKey: null, 
      runFinished: false,       // ★ 結果確定済みフラグ
      isRunning: false,
      forcedWakeLastNight: false
    }
  };
}

// =====================
// ゲームデータ
// =====================
let gameData = createInitialGameData();

// =====================
// 画面状態管理
// =====================
const SCREEN = {
  HOME: "home",
  TRAINING: "training",
  RUNNING: "running",
  RUN_RESULT: "runResult",
  OPTION: "option"
};

let currentScreen = SCREEN.HOME;

// =====================
// 地図用変数
// =====================

let map = null;
let mapMarker = null;
let routeLine = null;
let currentLatLng = null;
let runDistanceScale = 1;
let runRoute = []; // ★ 追加：現在の走行ルート
let mapMovedDistance = 0; // ★ 地図上で進んだ距離（m）
let isMapAutoFollow = true; // ★ 自動追尾ON/OFF
let startLatLng = null; // ★ 実走開始地点（強制帰還用）

// =====================
// ルート総距離計算
// =====================
let routeLengthMeter = 0;

function calculateRouteLength() {

  let total = 0;

  for (let i = 1; i < runRoute.length; i++) {

    const p1 = L.latLng(runRoute[i - 1]);
    const p2 = L.latLng(runRoute[i]);

    total += p1.distanceTo(p2);
  }

  routeLengthMeter = total;
}

function calcPolylineLength(route) {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += L.latLng(route[i - 1]).distanceTo(route[i]);
  }
  return total;
}


// =====================
// セーブデータ読み込み
// =====================
const saved = localStorage.getItem("gameData");
if (saved) {
  gameData = JSON.parse(saved);
}

// =====================
// 保険
// =====================
if (!gameData.time) gameData.time = { lastAccess: Date.now() };
if (!gameData.status) gameData.status = { energy: 50, mood: 50 };
if (!gameData.horse) {
  gameData.horse = { speed: 0, acceleration: 0, stamina: 0 };
}
if (!gameData.horse.name) {
  gameData.horse.name = "ななしの馬";
}
if (typeof gameData.horse.speed !== "number") {
  gameData.horse.speed = 0;
}
if (typeof gameData.horse.acceleration !== "number") {
  gameData.horse.acceleration = 0;
}
if (typeof gameData.horse.stamina !== "number") {
  gameData.horse.stamina = 0;
}
if (!gameData.status.fullness) gameData.status.fullness = 50;
if (!gameData.time.lastFeed) gameData.time.lastFeed = 0;
if (!gameData.time.feedCountToday) gameData.time.feedCountToday = 0;
if (!gameData.time.moodDayKey) gameData.time.moodDayKey = null;
if (!gameData.progress) gameData.progress = {};
if (typeof gameData.progress.totalRunDistance !== "number")
  gameData.progress.totalRunDistance = 0;
if (typeof gameData.progress.currentRunDistance !== "number")
  gameData.progress.currentRunDistance = 0;
if (!Array.isArray(gameData.progress.runSpeedHistory))
  gameData.progress.runSpeedHistory = [];
if (!Array.isArray(gameData.progress.savedRunRoute))
  gameData.progress.savedRunRoute = [];
if (!gameData.time.lastRunStart) {
  gameData.time.lastRunStart = 0;
}
if (!gameData.training) {
  gameData.training = { difficulty: 2 };
}
if (![1, 2, 3].includes(gameData.training.difficulty)) {
  gameData.training.difficulty = 2;
}

// =====================
// トレーニング設定
// =====================
const TRAINING = {
  energyCost: 20,
};

// =====================
// 横スクロール共通定数
// =====================
const BASE_SCROLL_SPEED = 3;

function getScrollSpeed() {
  const diff = gameData.training.difficulty;
  if (diff === 1) return BASE_SCROLL_SPEED * 0.7;
  if (diff === 3) return BASE_SCROLL_SPEED * 1.8;
  return BASE_SCROLL_SPEED;
}

// =====================
// 横スクロール配置定数（安定版）
// =====================
const SCREEN_RIGHT = 500;
const RESPAWN_MAX = 60;
const MIN_OBJECT_DISTANCE = 70;

// 配置距離の難易度ごとの調整
function getObjectDistance() {
  const diff = gameData.training.difficulty;

  if (diff === 1) return 110; // ★ 難易度1は広め
  if (diff === 3) return 110; // ★ 難易度3は広め
  return MIN_OBJECT_DISTANCE;
}

// =====================
// オブジェクトセット生成（ランダム版）
// =====================
function spawnSet() {
  // 画面右端より外側60〜120px先にオブジェクトセットの基準点
  const baseX =
    SCREEN_RIGHT +
    Math.random() * RESPAWN_MAX

  // --- 横方向ランダム ---
  const pattern = Math.random();

  let obstacleX, carrotX;

  if (pattern < 0.4) {
    // [ 障害物 ] ----70〜130px（難易度3は110~170）---- [ 人参 ]
    obstacleX = baseX;
    carrotX = baseX + getObjectDistance() + Math.random() * 60;
  } else if (pattern < 0.8) {
    // [ 人参 ] ----70〜130px（難易度3は130~190）---- [ 障害物 ]
    carrotX = baseX;
    obstacleX = baseX + getObjectDistance() + Math.random() * 60;
  } else {
    // 人参単独（ご褒美）
    obstacleX = baseX;
    carrotX = baseX + 200;
  }

  // --- 縦方向ランダム ---
  const carrotType = Math.random();
  let carrotY;

  if (carrotType < 0.2) {
    carrotY = 0;          // 地上（何もしなくても取れる）
  } else {
    carrotY = 55 + Math.random() * 25; // ジャンプ専用（55〜80px）
  }

  return { obstacleX, carrotX, carrotY };
}

// =====================
// 馬ランアニメーション定義
// =====================
const RUN_FRAMES = [
  "run1.png",
  "run2.png",
  "run3.png"
];

const RUN_FRAME_INTERVAL = 1000 / 6; 
// 3枚 × 2周 = 6フレーム / 秒 → 約167ms

let runFrameIndex = 0;
let runFrameTimer = null;
let isJumping = false;

function startRunAnimation() {
  if (runFrameTimer) return;

  const img = document.getElementById("horse-img");

  runFrameTimer = setInterval(() => {
    // ジャンプ中は run3 固定
    if (isJumping) {
      img.src = "run3.png";
      return;
    }

    img.src = RUN_FRAMES[runFrameIndex];
    runFrameIndex = (runFrameIndex + 1) % RUN_FRAMES.length;
  }, RUN_FRAME_INTERVAL);
}

function stopRunAnimation() {
  if (runFrameTimer) {
    clearInterval(runFrameTimer);
    runFrameTimer = null;
  }
}

// =====================
// 横スクロール状態
// =====================
let obstacleX = 0;
let carrotX = 0;
let carrotY = 0;
let score = 0;

let obstacleHitLock = false;
let carrotHitLock = false;

function respawnObstacle() {
  return SCREEN_RIGHT + Math.random() * RESPAWN_MAX
}

// =====================
// 馬の当たり判定（複数ボックス方式）
// =====================

// horse要素(75x50px)を基準にした相対座標
const HORSE_HITBOXES = [
  // 胴体（メイン）
  { x: 17, y: 26, w: 37, h: 25 },

  // 頭
  { x: 47, y: 7, w: 21, h: 12 },

  // しっぽ
  { x: 6, y: 26, w: 12, h: 7 }
];

// =====================
// 矩形同士の当たり判定
// =====================
function isRectHit(a, b) {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

// =====================
// 馬と物体の当たり判定
// =====================
function isHorseHit(targetRect) {

  const horseRect = horse.getBoundingClientRect();

  // 馬の各ヒットボックスをチェック
  for (const box of HORSE_HITBOXES) {

    const hitBoxRect = {
      left: horseRect.left + box.x,
      top: horseRect.top + box.y,
      right: horseRect.left + box.x + box.w,
      bottom: horseRect.top + box.y + box.h
    };

    if (isRectHit(hitBoxRect, targetRect)) {
      return true;
    }
  }

  return false;
}

// =====================
// DOM取得
// =====================
const statusMainDiv = document.getElementById("status-main");
const statusCoreDiv = document.getElementById("status-core");
const statusMoodDiv = document.getElementById("status-mood");
const statusConditionDiv = document.getElementById("status-condition");
const resetButton = document.getElementById("reset");
const trainingClickButton = document.getElementById("training-click");
const jumpButton = document.getElementById("jump-button");
const horse = document.getElementById("horse");
const obstacle = document.getElementById("obstacle");
const carrot = document.getElementById("carrot");
const scoreSpan = document.getElementById("score");
const feedButton = document.getElementById("feed");
const runStartButton  = document.getElementById("run-start");
const runViewToggleBtn =document.getElementById("run-view-toggle");
const runFinishedText = document.getElementById("run-finished-text");
const homeButton     = document.getElementById("home-button");
const trainingButton = document.getElementById("training-button");
const runButton      = document.getElementById("run-button");
const feedControls     = document.getElementById("feed-controls");
const trainingControls = document.getElementById("training-controls");
const runControls      = document.getElementById("run-controls");
const optionButton = document.getElementById("option-button");
const optionControls = document.getElementById("option-controls");
const horseNameInput = document.getElementById("horse-name-input");
const horseNameApply = document.getElementById("horse-name-apply");
const runDisplay = document.getElementById("run-display");
const routeErrorText = document.getElementById("route-error-text");
const routeLoading = document.getElementById("route-loading");
const homeHorse = document.getElementById("home-horse");
const sleepConfirm = document.getElementById("sleep-confirm");
const sleepText = document.getElementById("sleep-text");
const sleepWakeBtn = document.getElementById("sleep-wake");
const sleepCancelBtn = document.getElementById("sleep-cancel");
const feedRemainingDiv = document.getElementById("feed-remaining");
const cameraBtn = document.getElementById("camera-btn");
const cameraView = document.getElementById("camera-view");
const cameraControls = document.getElementById("camera-controls");
const cameraShotBtn = document.getElementById("camera-shot");
const cameraCancelBtn = document.getElementById("camera-cancel");
const cameraRetakeBtn = document.getElementById("camera-retake");
const difficultyButton = document.getElementById("difficulty-button");
const difficultyText   = document.getElementById("difficulty-text");
const difficultySelect = document.getElementById("difficulty-select");
const trainingLeft   = document.getElementById("training-left");
const trainingCenter = document.getElementById("training-center");
const mapDistanceText = document.getElementById("map-distance-text");

// ★ ルート生成中フラグ（表示制御専用）
let isRouteGenerating = false;

// =====================
// 難易度UI制御
// =====================
function updateDifficultyUI() {
  difficultyText.textContent = gameData.training.difficulty;
}

difficultyButton.onclick = () => {
  if (isTraining) return;

  trainingLeft.classList.add("hidden");
  trainingCenter.classList.add("hidden");
  difficultySelect.classList.remove("hidden");
};

difficultySelect.querySelectorAll("button").forEach(btn => {
  btn.onclick = () => {
    const diff = Number(btn.dataset.diff);
    gameData.training.difficulty = diff;

    save();
    updateDifficultyUI();

    difficultySelect.classList.add("hidden");
    trainingLeft.classList.remove("hidden");
    trainingCenter.classList.remove("hidden");
  };
});

// =====================
// カメラ制御
// =====================
let cameraStream = null;
let isCameraFrozen = false; // ★ 撮影後フリーズ中か

async function startCamera() {
  if (cameraStream) return;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    cameraView.srcObject = cameraStream;
    cameraView.classList.remove("hidden");

    // ★ モードボタンロック
    setModeButtonsLocked(true);

    // ★ UI切替
    feedControls.classList.add("hidden");
    cameraControls.classList.remove("hidden");

  } catch (err) {
    alert("カメラを起動できませんでした");
    console.error(err);
  }
}

cameraShotBtn.onclick = () => {
  if (!cameraStream || isCameraFrozen) return;

  // ★ カメラ映像停止
  cameraView.pause();

  // ★ 馬アニメ停止
  stopHomeHorseAnimation();

  // ★ UI切替
  cameraShotBtn.classList.add("hidden");
  cameraCancelBtn.classList.add("hidden");
  cameraRetakeBtn.classList.remove("hidden");

  isCameraFrozen = true;
};

cameraRetakeBtn.onclick = () => {
  if (!cameraStream) return;

  // ★ カメラ再開
  cameraView.play();

  // ★ 馬アニメ再開
  startHomeHorseAnimation();

  // ★ UI切替
  cameraRetakeBtn.classList.add("hidden");
  cameraShotBtn.classList.remove("hidden");
  cameraCancelBtn.classList.remove("hidden");

  isCameraFrozen = false;
};

cameraCancelBtn.onclick = () => {
  stopCamera();

  cameraControls.classList.add("hidden");
  feedControls.classList.remove("hidden");

  // UIリセット
  cameraShotBtn.classList.remove("hidden");
  cameraCancelBtn.classList.remove("hidden");
  cameraRetakeBtn.classList.add("hidden");

  startHomeHorseAnimation();
};

// =====================
// カメラ停止
// =====================
function stopCamera() {
  if (!cameraStream) return;

  // 全トラック停止（超重要）
  cameraStream.getTracks().forEach(track => {
    track.stop();
  });

  cameraStream = null;
  cameraView.srcObject = null;

  cameraView.classList.add("hidden");

  // ★ モードボタン解除
  setModeButtonsLocked(false);

  // ★ 状態リセット
  isCameraFrozen = false;
}

// =====================
// ホーム画面：馬アニメ状態定義
// =====================

// =====================
// 夜間判定ユーティリティ
// =====================
function isNightTime(date = new Date()) {
  const h = date.getHours();
  // 23:00〜翌6:00
  return h >= 23 || h < 6;
}

// =====================
// 夜間アクション確認
// =====================
function confirmWakeIfSleeping(actionCallback) {
  // 夜間かつ睡眠中でなければ、そのまま実行
  if (!isNightTime() || !isSleeping) {
    actionCallback();
    return;
  }

  // ---- UI切り替え ----
  [
    feedControls,
    trainingControls,
    runControls
  ].forEach(el => el.classList.add("hidden"));

  sleepConfirm.classList.remove("hidden");
  sleepText.textContent =
    gameData.horse.name + "は寝ています。起こしますか？";

  // 「起こさない」
  sleepCancelBtn.onclick = () => {
    sleepConfirm.classList.add("hidden");
    switchScreen(currentScreen); // 元の画面に戻す
  };

  // 「起こす」
sleepWakeBtn.onclick = () => {
  // ★ 機嫌 -50（0未満にならない）
  gameData.status.mood = Math.max(
    0,
    gameData.status.mood - 50
  );

  // 睡眠解除
  isSleeping = false;
  forcedSleep = false;

  // ★ 夜に強制的に起こした記録
  gameData.time.forcedWakeLastNight = true;

  save();
  render();

  // ★ UIを元の画面状態に戻す
  sleepConfirm.classList.add("hidden");
  switchScreen(currentScreen);

  // ★ 本来の処理を実行
  actionCallback();
};
}

// 状態名一覧
const HORSE_STATE = {
  IDLE: "pendora-def",
  BLINK: "pendora-blink",
  HIZAMAGE: "pendora-hizamage",
  LOOK: "pendora-kochiramuki",
  SIT: "pendora-sitdown",
  SIT_BLINK: "pendora-sitdown-blink"
};

let homeHorseState = HORSE_STATE.IDLE;
let homeHorseTimer = null;
let beforeHizamageState = HORSE_STATE.IDLE;
// ===== 睡眠状態管理 =====
let isSleeping = false;        // 今寝ているか
let forcedSleep = false;      // 夜間ロック（遷移完全停止）

// 5〜10秒ランダム
function randomLongInterval() {
  return 5000 + Math.random() * 5000;
}

function getNextHorseState(current) {
  const r = Math.random();

  switch (current) {
    // ① pendora-def
    case HORSE_STATE.IDLE:
      if (r < 0.5) return HORSE_STATE.BLINK;        // 50%
      if (r < 0.7) return HORSE_STATE.HIZAMAGE;     // 20%
      return HORSE_STATE.LOOK;                      // 30%

    // ② pendora-blink
    case HORSE_STATE.BLINK:
      return HORSE_STATE.IDLE;

    // ③ pendora-hizamage
    case HORSE_STATE.HIZAMAGE:
      // 立ち → 座り
      if (beforeHizamageState === HORSE_STATE.IDLE) {
        return HORSE_STATE.SIT;
      }
      // 座り → 立ち
      if (beforeHizamageState === HORSE_STATE.SIT) {
        return HORSE_STATE.IDLE;
      }
      // 保険
      return HORSE_STATE.IDLE;

    // ④ pendora-kochiramuki
    case HORSE_STATE.LOOK:
      return HORSE_STATE.IDLE;

    // ⑤ pendora-sitdown
    case HORSE_STATE.SIT:
      if (r < 0.2) return HORSE_STATE.HIZAMAGE;         // 20%
      return HORSE_STATE.SIT_BLINK;                 // 80%

    // ⑥ pendora-sitdown-blink
    case HORSE_STATE.SIT_BLINK:
      return HORSE_STATE.SIT;
  }
}

// 全モードボタンを取得
const modeButtons = [
  homeButton,
  trainingButton,
  runButton,
  optionButton
];

// =====================
// モード遷移ボタンロック制御
// =====================
function setModeButtonsLocked(locked) {
  homeButton.disabled = locked;
  trainingButton.disabled = locked;
  runButton.disabled = locked;
  optionButton.disabled = locked;
}

// =====================
// 実走中：育成アクションロック
// =====================
function updateRunActionLock() {
  const now = Date.now();
  const todayKey = getDayKey(now);

  const alreadyRunToday =
    gameData.time.lastRunDayKey === todayKey;

  // ★ 実走開始ボタンロック条件
  const runLocked =
    gameData.time.isRunning || alreadyRunToday;

  // ---- 実走開始ボタン ----
  runStartButton.disabled = runLocked;

  // ---- 実走済みテキスト ----
  if (alreadyRunToday && !gameData.time.isRunning) {
    runFinishedText.classList.remove("hidden");
  } else {
    runFinishedText.classList.add("hidden");
  }

  // ---- 他アクション ----
  const actionLocked = gameData.time.isRunning;

  feedButton.disabled = actionLocked;
  cameraBtn.disabled = actionLocked;
  trainingButton.disabled = actionLocked;
}

// =====================
// モード選択ボタン表示更新
// =====================
function updateModeButtonActive(screen) {
  modeButtons.forEach(btn => {
    btn.classList.remove("mode-active");
  });

  if (screen === SCREEN.HOME) homeButton.classList.add("mode-active");
  if (screen === SCREEN.TRAINING) trainingButton.classList.add("mode-active");
  if (screen === SCREEN.RUNNING || screen === SCREEN.RUN_RESULT)
    runButton.classList.add("mode-active");
  if (screen === SCREEN.OPTION) optionButton.classList.add("mode-active");
}

// =====================
// ホーム画面：馬アニメ制御
// =====================
function startHomeHorseAnimation() {
  if (homeHorseTimer) return;

  const img = homeHorse.querySelector("img");

  // ===== 再読み込み時：夜なら即スリープ =====
    if (isNightTime()) {
    homeHorseState = "pendora-sleep";
    img.src = homeHorseState + ".png";
    isSleeping = true;
    forcedSleep = true;

    // ★ 朝になるかを定期チェック
    homeHorseTimer = setTimeout(step, 60 * 1000); // 1分ごと
    return;
  }

  function step() {
    img.src = homeHorseState + ".png";

    let delay = 0;

    // 表示時間決定
    if (
      homeHorseState === HORSE_STATE.BLINK ||
      homeHorseState === HORSE_STATE.HIZAMAGE ||
      homeHorseState === HORSE_STATE.SIT_BLINK
    ) {
      delay = 500;
    } else {
      delay = randomLongInterval();
    }
    
        // ===== 夜に入ったら、sitdown-blink から sleep へ =====
    if (
      !forcedSleep &&
      isNightTime() &&
      homeHorseState === HORSE_STATE.SIT_BLINK
    ) {
      homeHorseTimer = setTimeout(() => {
        homeHorseState = "pendora-sleep";
        img.src = homeHorseState + ".png";
        isSleeping = true;
        forcedSleep = true;
      }, randomLongInterval());
      return;
    }

        // ===== 朝になったら sleep → sitdown-blink で復帰 =====
    if (
      forcedSleep &&
      !isNightTime() &&
      isSleeping
    ) {
      homeHorseTimer = setTimeout(() => {
        homeHorseState = HORSE_STATE.SIT_BLINK;
        img.src = homeHorseState + ".png";
        isSleeping = false;
        forcedSleep = false;

        homeHorseTimer = null; // ★ 念のためリセット
        step();               // 通常ロジック復帰
      }, randomLongInterval());
      return;
    }

    homeHorseTimer = setTimeout(() => {

  // ★ 次の状態を一度だけ決定
  const nextState = getNextHorseState(homeHorseState);

  // ★ hizamageに入る直前の状態を記録
  if (nextState === HORSE_STATE.HIZAMAGE) {
    beforeHizamageState = homeHorseState;
  }

  if (!forcedSleep) {
  homeHorseState = nextState;
  step();
  }

}, delay);

  }

  step();
}

function stopHomeHorseAnimation() {
  if (homeHorseTimer) {
    clearTimeout(homeHorseTimer);
    homeHorseTimer = null;
  }
}

// =====================
// 画面遷移制御
// =====================
function switchScreen(screen) {
  currentScreen = screen;
  updateModeButtonActive(screen);

  // ===== まず全非表示 =====
    [
      feedControls,
      trainingControls,
      runControls,
      optionControls,
      sleepConfirm,
      document.getElementById("scroll-training"),
      runDisplay,
      homeHorse
    ].forEach(el => el.classList.add("hidden"));

    stopHomeHorseAnimation();
  
  // ルートエラー表示は画面切替時に必ず消す
  if (routeErrorText) {
    routeErrorText.classList.add("hidden");
  }

  if (routeLoading) {
    routeLoading.classList.add("hidden");
  }

  // ★ 画面遷移＝ルート生成中ではない
  isRouteGenerating = false;

  // ===== モード共通（常に表示）=====
  // ・モード選択ボタン
  // ・ステータス
  // ・機嫌テキスト
  // ・開発用ボタン
  // → 何もしない（常時表示）

  // ===== HOME =====
if (screen === SCREEN.HOME) {
  feedControls.classList.remove("hidden");
  trainingControls.classList.add("hidden");
  runControls.classList.add("hidden");

  // ★ 実走中は馬を表示しない
  if (!gameData.time.isRunning) {
    homeHorse.classList.remove("hidden");
    startHomeHorseAnimation();
  }

  // ★ カメラ表示はホーム専用
  if (cameraStream) {
    cameraView.classList.remove("hidden");
  }
}

  // ===== TRAINING =====
  if (screen === SCREEN.TRAINING) {
    trainingControls.classList.remove("hidden");
    document.getElementById("scroll-training").classList.remove("hidden");
  }

  // ===== RUNNING =====
  if (screen === SCREEN.RUNNING) {
    runControls.classList.remove("hidden");
    runDisplay.classList.remove("hidden");

    // ★ 初期はグラフ表示
    isRunMapView = false;
    updateRunView();
  }

  // ===== RUN_RESULT =====
  if (screen === SCREEN.RUN_RESULT) {
    runControls.classList.remove("hidden");
    runDisplay.classList.remove("hidden");
  }

  // ===== OPTION =====
  if (screen === SCREEN.OPTION) {
    optionControls.classList.remove("hidden");
    horseNameInput.value = gameData.horse.name;
  }
}


// =====================
// モード選択ボタン制御
// =====================
homeButton.onclick = () => {
  if (isTraining) return;
  switchScreen(SCREEN.HOME);
};

trainingButton.onclick = () => {
  if (isTraining) return;
  switchScreen(SCREEN.TRAINING);
};


runButton.onclick = () => {
  if (isTraining) return;

  switchScreen(SCREEN.RUNNING);

  // ★ 実走開始時は必ずグラフ表示から始める
  isRunMapView = false;
  updateRunView();

  if (gameData.time.isRunning) {
    setTimeout(drawSpeedGraph, 100);
    return;
  }

  if (gameData.time.runFinished) {
    switchScreen(SCREEN.RUN_RESULT);
    return;
  }
};

optionButton.onclick = () => {
  if (isTraining) return;   // ★ トレーニング中のみガード
  switchScreen(SCREEN.OPTION);
};

// 他操作ロック用フラグ
let isTraining = false;

// =====================
// 放置成長
// =====================
function applyIdleGrowth() {
  const now = Date.now();
  const elapsedSeconds = (now - gameData.time.lastAccess) / 1000;
  if (elapsedSeconds <= 0) return;

  // ===== 満腹度減衰 =====
  const fullnessDecay = elapsedSeconds / 360;
  gameData.status.fullness = Math.max(
    0,
    gameData.status.fullness - fullnessDecay
  );

  // ===== 満腹度による成長効率 =====
  const fullnessRate = gameData.status.fullness / 100;
  const fullnessFactor = 0.5 + fullnessRate * 0.7; // 0.5～1.2

  // ===== 放置成長 =====
  gameData.horse.speed += (elapsedSeconds / 10) * fullnessFactor;

  // ===== 元気度回復 =====
  gameData.status.energy += elapsedSeconds / 180;
  if (gameData.status.energy > 100) {
    gameData.status.energy = 100;
  }

  gameData.time.lastAccess = now;
  save();
}

// =====================
// 放置成長：リアルタイム更新（毎秒）
// =====================
setInterval(() => {
  applyIdleGrowth();
  render();
}, 1000);

// =====================
// 日付キー取得（6時区切り）【給餌用】
// =====================
function getDayKey(timestamp) {
  const d = new Date(timestamp);
  d.setHours(d.getHours() - 6); // 6時区切り
  return d.toDateString();
}

// =====================
// 給餌回数（日付更新）チェック
// =====================
function updateDailyFeedCount() {
  const now = Date.now();
  const todayKey = getDayKey(now);
  const lastFeedKey = gameData.time.lastFeed
    ? getDayKey(gameData.time.lastFeed)
    : null;

  if (todayKey !== lastFeedKey) {
    gameData.time.feedCountToday = 0;
  }
}

// =====================
// 給餌：残り回数表示更新
// =====================
function updateFeedRemainingText() {
  const maxFeed = 3;
  const used = gameData.time.feedCountToday;
  const remaining = Math.max(0, maxFeed - used);

  feedRemainingDiv.textContent =
    "あと " + remaining + " 回";
}

// =====================
// 機嫌（日替わり）更新
// =====================
function updateDailyMood() {
  const now = Date.now();
  const todayKey = getDayKey(now);

  if (gameData.time.moodDayKey === todayKey) {
    return; // 今日は既に決定済み
  }

  // ★ ランダム決定（少し中庸寄り）
  let base = 30 + Math.random() * 40; // 30〜70

  // ★ 前夜に強制的に起こされていたら -30
  if (gameData.time.forcedWakeLastNight) {
    base -= 30;
    gameData.time.forcedWakeLastNight = false; // ★ 消費
  }

  gameData.status.mood = Math.max(0, Math.floor(base));

  gameData.time.moodDayKey = todayKey;
  save();
}

// =====================
// 機嫌テキスト変換
// =====================
function getMoodText(mood) {
  if (mood >= 80) return "今日は絶好調のようだ";
  if (mood >= 60) return "ご機嫌で調子がよさそう";
  if (mood >= 40) return "落ち着いている";
  if (mood >= 20) return "あまり機嫌がよくなさそうだ";
  return "かなり機嫌が悪そうだ";
}

// =====================
// 機嫌 → トレーニング時間（秒）
// =====================
function getTrainingTimeByMood(mood) {
  if (mood >= 80) return 30;
  if (mood >= 60) return 25;
  if (mood >= 40) return 20;
  if (mood >= 20) return 15;
  return 10;
}

// =====================
// トレーニング処理
// =====================
function doTraining(score) {
  if (gameData.status.energy < TRAINING.energyCost) {
    alert("元気度が足りません");
    return;
  }

  gameData.status.energy -= TRAINING.energyCost;

  // ★ 成長量 = スコア
  gameData.horse.acceleration += score;

  save();
  render();
}

// =====================
// 実走設定（開発中）
// =====================
// 待ち時間（現実時間）
const RUN_WAIT_MS = 5 * 60 * 1000; // 開発用5分

// 実走シミュレーション時間（ゲーム内）
const RUN_SIMULATION_HOURS = 1; // 常に1時間
const RUN_TIME_SCALE = 3600 / (RUN_WAIT_MS / 1000);
// 現状、開発用：5分 → 3600 / 300 = 12
// ★ 実走シミュレーション進行量（1秒あたり何秒分進むか）
const RUN_SIM_STEP = RUN_TIME_SCALE; // 開発用：12秒


// =====================
// 速度パラメータ計算
// =====================
function calculateRunParameters() {
  const B  = gameData.horse.speed;
  const A  = gameData.horse.acceleration;
  const D  = gameData.progress.totalRunDistance;
  const M  = gameData.status.mood;
  const E  = gameData.status.energy;

  const f_mood   = 0.95 + 0.001 * M;
  const f_energy = 0.9  + 0.002 * E;
  const Bp = B * f_mood * f_energy;

  const alpha = 0.05;
  const Vmax = Bp * (1 + alpha * Math.sqrt(A));

  const gamma = 1e-6;
  const Vend = Bp * (1 - Math.exp(-gamma * D));

  return { Bp, Vmax, Vend };
}

// =====================
// １秒ごとの実走シミュレーション関数
// =====================
function simulateRun() {
  const { Bp, Vmax, Vend } = calculateRunParameters();

  const T = RUN_SIMULATION_HOURS * 3600; // 秒（1時間）
  const T1 = 0.2 * T;
  const T2 = 0.5 * T;
  const T3 = 0.3 * T;

  let tmpDistance = 0;

  for (let t = 0; t < T; t++) {
    let v; // m/h

    if (t < T1) {
      v = Vmax * (t / T1);
    } else if (t < T1 + T2) {
      const tt = t - T1;
      v = Vmax - (Vmax - Bp) * (tt / T2);
    } else {
      const tt = t - T1 - T2;
      v = Bp - (Bp - Vend) * (tt / T3);
    }

    const v_mps = v / 3600;
    tmpDistance += v_mps;
  }

  // gameData.progress.currentRunDistance = distance;
  return tmpDistance;
}

// 進行用共通関数
function calculateSpeedAt(t, params) {
  const T = RUN_SIMULATION_HOURS * 3600;
  const T1 = 0.2 * T;
  const T2 = 0.5 * T;
  const T3 = 0.3 * T;

  if (t < T1) {
    return params.Vmax * (t / T1);
  } else if (t < T1 + T2) {
    const tt = t - T1;
    return params.Vmax - (params.Vmax - params.Bp) * (tt / T2);
  } else {
    const tt = t - T1 - T2;
    return params.Bp - (params.Bp - params.Vend) * (tt / T3);
  }
}

// =====================
// 再読み込み時：地図復元
// =====================
function restoreRunMap() {

  // 地図準備
  initRunMap();

  const saved = gameData.progress.savedRunRoute;

  if (!saved || saved.length < 2) return;

  // ルート復元
  runRoute = saved;

  // 既存削除
  if (routeLine) {
    map.removeLayer(routeLine);
  }

  // 再描画
  routeLine = L.polyline(runRoute, {
    color: "magenta",
    weight: 3
  }).addTo(map);

  // ★ 自動追尾ONに戻す
  isMapAutoFollow = true;

  // ★ 現在距離から位置復元
  updateMarkerByDistance(
    gameData.progress.currentRunDistance
  );
}

// =====================
// 実走再開用関数（※再読み込み時専用）
// =====================
function resumeRunFromElapsed() {
  const now = Date.now();
  const elapsedRealSec = (now - gameData.time.lastRunStart) / 1000;
  const elapsedSimSec = Math.floor(elapsedRealSec * RUN_TIME_SCALE);

  const params = calculateRunParameters();
  const T = RUN_SIMULATION_HOURS * 3600;

  let distance = 0;
  gameData.progress.runSpeedHistory = [];

  for (let t = 0; t < elapsedSimSec && t < T; t += RUN_SIM_STEP) {
    const v = calculateSpeedAt(t, params);
    distance += (v / 3600) * RUN_SIM_STEP;

    gameData.progress.runSpeedHistory.push({
      t,
      v,
      s: distance
    });
  }

  gameData.progress.currentRunDistance = distance;
  save();

  restoreRunMap(); // ★ 地図復元
  startRealtimeRun(elapsedSimSec, params);
}


function startRealtimeRun(startT, params) {
  let t = startT;
  const T = RUN_SIMULATION_HOURS * 3600;
  const dt = RUN_SIM_STEP; // ★ 12秒分進める

  const interval = setInterval(() => {
    if (!gameData.time.isRunning) {
      clearInterval(interval);
      return;
    }

    if (t >= T) {
      gameData.time.isRunning = false;
      gameData.time.runFinished = true;
      gameData.progress.totalRunDistance += gameData.progress.currentRunDistance;

      // ★ 瞬間最高速度（m/h → km/h）
      const maxSpeed = Math.max(
        ...gameData.progress.runSpeedHistory.map(d => d.v)
      );
      const maxSpeedKmH = (maxSpeed / 1000).toFixed(2);

      document.getElementById("run-distance-text").innerHTML =
        "走行距離：" +
        formatDistanceKm(gameData.progress.currentRunDistance) +
        "<br>" +
        "瞬間最高速度：" + maxSpeedKmH + " km/h";
        
      save();

      // ★ 誤差吸収：ほぼ一周していたら出発地点にスナップ
      if (
        mapMarker &&
        startLatLng &&
        routeLengthMeter > 0 &&
        gameData.progress.currentRunDistance >= routeLengthMeter * 0.98
      ) {
        mapMarker.setLatLng(startLatLng);

       if (isMapAutoFollow && map) {
          map.setView(startLatLng, map.getZoom());
        }
      }

      render();
      clearInterval(interval);

      switchScreen(SCREEN.RUN_RESULT);
      return;
    }

    const v = calculateSpeedAt(t, params);
    gameData.progress.currentRunDistance +=
      (v / 3600) * dt;

    gameData.progress.runSpeedHistory.push({
      t,
      v,
      s: gameData.progress.currentRunDistance
    });

    t += dt;

    setTimeout(drawSpeedGraph, 100);

    updateMarkerByDistance(
      gameData.progress.currentRunDistance
    );

  }, 1000);
}

// =====================
// 実走：開始処理（フェーズ2-⑥）
// =====================
function startRun() {

  isMapAutoFollow = true; // ★ 実走開始時は追尾ON

  // ★ 地図未初期化なら初期化
  initRunMap();

  // ★ 出発地点を保存（誤差補正用）
  startLatLng = [...currentLatLng];
  
  // ★ 実走中ガード（最重要）
  if (gameData.time.isRunning) {
    alert("実走中です");
    return;
  }

  const now = Date.now();
  const todayKey = getDayKey(now);

  if (gameData.status.energy < 30) {
    alert("元気度が足りません");
    return;
  }

  gameData.status.energy -= 30;
  gameData.time.lastRunStart = now;
  gameData.time.lastRunDayKey = todayKey;
  gameData.time.runFinished = false;
  gameData.time.isRunning = true;

  
  gameData.progress.runSpeedHistory = [];
  gameData.progress.currentRunDistance = 0;

  mapMovedDistance = 0;
  if (mapDistanceText) {
    mapDistanceText.textContent = "地図上移動距離：0 m";
  }

  // ★ グラフ初期点（0秒）を入れる
  gameData.progress.runSpeedHistory.push({
    t: 0,
    v: 0,
    s: 0
  });

  // ★ 最終走行距離を事前計算（予測）
  const predictedDistance = simulateRun();

  save();
  render();

  //alert("実走を開始しました。");
  switchScreen(SCREEN.RUNNING);

  const params = calculateRunParameters();

const t = calcRoundTripCount(predictedDistance);
const oneWayDistance = predictedDistance / (2 * t);

// ★ ここからルート生成フェーズ
isRouteGenerating = true;
routeLoading.classList.remove("hidden");

fetchOneWayRoute(currentLatLng, oneWayDistance)
  .then(oneWay => {

    // ★ 生成完了
    isRouteGenerating = false;
    routeLoading.classList.add("hidden");

    if (!oneWay) {

    // ★ ローディング終了
    isRouteGenerating = false;
    routeLoading.classList.add("hidden");

    // ★ 失敗テキスト表示
    routeErrorText.classList.remove("hidden");

    gameData.time.isRunning = false;
    save();
    render();
    return;
  }

    // ★ 成功したらエラー表示は消す
    routeErrorText.classList.add("hidden");

    let fullRoute = [];
    for (let i = 0; i < t; i++) {
      fullRoute = fullRoute.concat(
        i === 0 ? makeRoundTripRoute(oneWay)
                : makeRoundTripRoute(oneWay).slice(1)
      );
    }

    runRoute = fullRoute;

    if (!runRoute || runRoute.length < 2) {

    isRouteGenerating = false;
    routeLoading.classList.add("hidden");
    routeErrorText.classList.remove("hidden");

    gameData.time.isRunning = false;
    save();
    render();
    return;
  }

    // ★ ルート保存（再読み込み対策）
    gameData.progress.savedRunRoute = runRoute;
    save();

    // 既存ルート削除
    if (routeLine) {
      map.removeLayer(routeLine);
    }

    // 地図再描画
    routeLine = L.polyline(runRoute, {
      color: "magenta",
      weight: 3
    }).addTo(map);

    calculateRouteLength();

  setTimeout(() => {
    startRealtimeRun(0, params);
    drawSpeedGraph(); // ★ 初回描画を保証
  }, 200);
});

}

// =====================
// 地図初期化
// =====================

function initRunMap() {

  if (map) return;

  // 現在地（仮：自宅）
  currentLatLng = [35.016848, 135.792370];

  map = L.map("map").setView(currentLatLng, 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  // マーカー
  mapMarker = L.marker(currentLatLng).addTo(map);

  // ★ 手動操作したら自動追尾OFF
  map.on("dragstart zoomstart", () => {
    isMapAutoFollow = false;
  });
}

// =====================
// 距離 → 位置変換
// =====================
function updateMarkerByDistance(distanceMeter) {

  if (!map || !mapMarker) return;
  if (runRoute.length < 2) return;

  let remain = distanceMeter;
  let moved = 0;

  for (let i = 1; i < runRoute.length; i++) {

    const p1 = L.latLng(runRoute[i - 1]);
    const p2 = L.latLng(runRoute[i]);
    const seg = p1.distanceTo(p2);

    if (remain <= seg) {

      const ratio = remain / seg;

      const lat =
        p1.lat + (p2.lat - p1.lat) * ratio;
      const lng =
        p1.lng + (p2.lng - p1.lng) * ratio;

      const pos = [lat, lng];

      mapMarker.setLatLng(pos);

      moved += remain;
      mapMovedDistance = moved;

      if (mapDistanceText) {
        mapDistanceText.textContent =
          "地図上移動距離：" +
          Math.floor(mapMovedDistance) + " m";
      }

      if (isMapAutoFollow) {
        map.setView(pos, map.getZoom());
      }

      return;
    }

    remain -= seg;
    moved += seg;
  }

  // ゴール（1周完了）
  const last = runRoute[runRoute.length - 1];
  mapMarker.setLatLng(last);

  mapMovedDistance = moved;

  if (mapDistanceText) {
    mapDistanceText.textContent =
      "地図上移動距離：" +
      Math.floor(mapMovedDistance) + " m";
  }
}

// =====================
// 往復ルート生成（片道＋逆順）
// =====================
function makeRoundTripRoute(oneWayRoute) {

  if (!oneWayRoute || oneWayRoute.length < 2) {
    return [];
  }

  // 復路（逆順・最初は除外）
  const back = [...oneWayRoute]
    .slice(0, -1)
    .reverse();

  // 往復結合
  return oneWayRoute.concat(back);
}

// =====================
// 地図上ルート設定に係る定数・補助関数
// =====================
const SAFE_ROUTE_UNIT = 3000; // 3km
const MAX_API_TRIAL = 50;
const MAX_RETRY_PROCESS = 3;

function calcRoundTripCount(distanceMeter) {
  return Math.max(1, Math.ceil(distanceMeter / 200000));
}

// =====================
// OSRM片道ルート取得（分割探索方式）
// =====================
async function fetchOneWayRoute(startLatLng, targetDistance) {

  let current = startLatLng;
  let route = [current];
  let totalDistance = 0;

  let prevAngle = null;
  let retryCount = 0;
  let apiCount = 0;

  while (totalDistance < targetDistance && apiCount < MAX_API_TRIAL) {

    let angle;
    if (prevAngle === null) {
      angle = Math.random() * Math.PI * 2;
    } else {
      const delta = (Math.random() * 120 - 60) * Math.PI / 180;
      angle = prevAngle + delta;
    }

    const step = Math.min(SAFE_ROUTE_UNIT, targetDistance - totalDistance);
    const nextRoute = await fetchShortRoute(current, step, angle);
    apiCount++;

    if (!nextRoute || nextRoute.length < 2) {
      retryCount++;
      if (retryCount > MAX_RETRY_PROCESS) return null;

      const offsets = [90, -90, 180];
      angle = prevAngle + offsets[retryCount - 1] * Math.PI / 180;
      continue;
    }

    retryCount = 0;

    const segDist = calcPolylineLength(nextRoute);

    // ★ 超過したら切り詰め
    if (totalDistance + segDist > targetDistance) {

      const need = targetDistance - totalDistance;
      let cutRoute = [nextRoute[0]];
      let acc = 0;

      for (let i = 1; i < nextRoute.length; i++) {
        const d = L.latLng(nextRoute[i - 1]).distanceTo(nextRoute[i]);

        if (acc + d >= need) {
          const r = (need - acc) / d;
          const lat =
            nextRoute[i - 1][0] +
            (nextRoute[i][0] - nextRoute[i - 1][0]) * r;
          const lng =
            nextRoute[i - 1][1] +
            (nextRoute[i][1] - nextRoute[i - 1][1]) * r;

          cutRoute.push([lat, lng]);
          break;
        }

        acc += d;
        cutRoute.push(nextRoute[i]);
      }

      route.push(...cutRoute.slice(1));
      break;
    }

    route.push(...nextRoute.slice(1));
    totalDistance += segDist;
    current = nextRoute[nextRoute.length - 1];
    prevAngle = angle;
  }

  return route;
}


async function fetchShortRoute(startLatLng, dist, angle) {

  const lat = startLatLng[0];
  const lng = startLatLng[1];

  const dLat = (dist * Math.cos(angle)) / 111000;
  const dLng =
    (dist * Math.sin(angle)) /
    (111000 * Math.cos(lat * Math.PI / 180));

  const goal = [lat + dLat, lng + dLng];

  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${lng},${lat};${goal[1]},${goal[0]}` +
    `?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || !data.routes[0]) return null;

    return data.routes[0].geometry.coordinates.map(p => [p[1], p[0]]);
  } catch {
    return null;
  }
}

async function fetchShortRouteOnce(startLatLng, dist) {

  const angle = Math.random() * Math.PI * 2;
  return await fetchShortRoute(startLatLng, dist, angle);
}



// =====================
// 速度グラフ描画
// =====================

// グラフ用スケール関数
function calculateGraphVMax(value) {
  if (value <= 100000) {
    const n = Math.floor(Math.log10(value));
    const base = Math.pow(10, n);
    if (value <= base) return base;
    if (value <= base * 5) return base * 5;
    return base * 10;
  }

  return Math.ceil(value / 50000) * 50000;
}

function drawSpeedGraph() {
  const LEFT_MARGIN = 45;
  const RIGHT_MARGIN = 45;
  const TOP_MARGIN = 25;
  const BOTTOM_MARGIN = 20;

  const canvas = document.getElementById("speed-graph");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const history = gameData.progress.runSpeedHistory;
  if (history.length < 2) return;
  
  const maxAttainedSpeed = Math.max(...history.map(d => d.v));

  // ★ 最低最大値を 1000 m/h に固定
  const speedBaseMax = 1000;
  const speedForScale = Math.max(speedBaseMax, maxAttainedSpeed);

  const T = RUN_SIMULATION_HOURS * 3600;
  const { Vmax } = calculateRunParameters();
  const graphVMax = calculateGraphVMax(speedForScale);

  // 縦軸単位判定
  let unit = "m/h";
  let unitFactor = 1;

  if (graphVMax >= 5000) {
    unit = "km/h";
    unitFactor = 1000;
  }

  // ===== 軸 =====
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1;

  // Y軸
  ctx.beginPath();
  ctx.moveTo(LEFT_MARGIN, TOP_MARGIN);
  ctx.lineTo(LEFT_MARGIN, canvas.height - BOTTOM_MARGIN);
  ctx.stroke();

  // X軸
  ctx.beginPath();
  ctx.moveTo(LEFT_MARGIN, canvas.height - BOTTOM_MARGIN);
  ctx.lineTo(canvas.width - RIGHT_MARGIN, canvas.height - BOTTOM_MARGIN);
  ctx.stroke();

  ctx.fillStyle = "#aaa";
  ctx.font = "10px sans-serif";

  // Y軸目盛り
  for (let i = 0; i <= 5; i++) {
    const v = (graphVMax / 5) * i;
    const y =
     canvas.height -
     BOTTOM_MARGIN -
     (v / graphVMax) * (canvas.height - TOP_MARGIN - BOTTOM_MARGIN);
    ctx.fillText(
      Math.round(v / unitFactor),
      LEFT_MARGIN - 28,
      y + 3
    );
  }

  ctx.fillText("(" + unit + ")", 2, TOP_MARGIN - 8);

  // X軸（分表示）
  ctx.fillText("0", 30, canvas.height - 5);
  ctx.fillText("60分", canvas.width - 40, canvas.height - 5);

  // ===== グラフ本体 =====
  ctx.beginPath();
  ctx.strokeStyle = "rgba(0, 242, 255, 0.904)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 2]); // 5px線＋2px隙間

  history.forEach((d, i) => {
    const graphWidth = canvas.width - LEFT_MARGIN - RIGHT_MARGIN;

    const x =
      LEFT_MARGIN + (d.t / T) * graphWidth;

    const graphHeight = canvas.height - TOP_MARGIN - BOTTOM_MARGIN;

    const y =
      canvas.height -
      BOTTOM_MARGIN -
      (d.v / graphVMax) * graphHeight;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
  // ★ 次の描画に影響しないようリセット
  ctx.setLineDash([]);

  // ===== 距離グラフ（赤） =====
const maxDistance = Math.max(...history.map(d => d.s));

// ★ 最低最大値を 1000 m に固定
const distanceBaseMax = 1000;
const distanceForScale = Math.max(distanceBaseMax, maxDistance);

const graphDMax = calculateGraphVMax(distanceForScale);


// 距離の単位判定
let dUnit = "m";
let dUnitFactor = 1;

if (graphDMax >= 5000) {
  dUnit = "km";
  dUnitFactor = 1000;
}

ctx.beginPath();
ctx.strokeStyle = "rgb(255, 238, 0)";
ctx.lineWidth = 2;

history.forEach((d, i) => {
  const graphWidth = canvas.width - LEFT_MARGIN - RIGHT_MARGIN;

  const x =
    LEFT_MARGIN + (d.t / T) * graphWidth;

  const graphHeight = canvas.height - TOP_MARGIN - BOTTOM_MARGIN;

  const y =
    canvas.height -
    BOTTOM_MARGIN -
    (d.s / graphDMax) * graphHeight;

  if (i === 0) ctx.moveTo(x, y);
  else ctx.lineTo(x, y);
});

ctx.stroke();

// ===== 右Y軸（距離） =====
ctx.strokeStyle = "#888";
const rightAxisX = canvas.width - RIGHT_MARGIN;

ctx.beginPath();
ctx.moveTo(rightAxisX, TOP_MARGIN);
ctx.lineTo(rightAxisX, canvas.height - BOTTOM_MARGIN);
ctx.stroke();


ctx.fillStyle = "#aaa";
for (let i = 0; i <= 5; i++) {
  const d = (graphDMax / 5) * i;
  const y =
    canvas.height -
    BOTTOM_MARGIN -
    (d / graphDMax) * (canvas.height - TOP_MARGIN - BOTTOM_MARGIN);
  ctx.fillText(
    Math.round(d / dUnitFactor),
    canvas.width - RIGHT_MARGIN + 5, // ← 軸の内側に寄せる
    y + 3
  );
}

const yTop =
  canvas.height -
  BOTTOM_MARGIN -
  (graphDMax / graphDMax) * (canvas.height - TOP_MARGIN - BOTTOM_MARGIN);

ctx.fillText(
  "(" + dUnit + ")",
  rightAxisX, // 数字と揃える
  yTop - 8
);

}

// =====================
// 実走：結果表示ボタン用
// =====================
function showRunResult() {
  finishRun();
}

// =====================
// 給餌処理（フェーズ2-⑥）
// =====================
function feedHorse() {
  if (gameData.time.isRunning) {
  alert("実走中は給餌できません");
  return;
  }

  const now = Date.now();

  const todayKey = getDayKey(now);
  const lastFeedKey = gameData.time.lastFeed
    ? getDayKey(gameData.time.lastFeed)
    : null;

  // 日付が変わっていたら回数リセット
  if (todayKey !== lastFeedKey) {
    gameData.time.feedCountToday = 0;
  }

  if (gameData.time.feedCountToday >= 3) {
    alert("今日はもうこれ以上食べられません");
    return;
  }

  // --- 効果 ---
  gameData.status.fullness = Math.min(
    100,
    gameData.status.fullness + 50
  );

  gameData.status.mood = Math.min(
    100,
    gameData.status.mood + 5
  );

  gameData.time.feedCountToday += 1;
  gameData.time.lastFeed = now;

  save();
  render();
}

// =====================
// フェーズA：横スクロール（安定版）
// =====================
function startScrollTraining() {
  if (gameData.time.isRunning) {
  alert("実走中はトレーニングできません");
  return;
  }

  switchScreen(SCREEN.TRAINING);

  if (isTraining) return;

  if (gameData.status.energy < TRAINING.energyCost) {
    alert("元気度が足りません");
    return;
  }

  // トレーニング開始中のボタン制御
  trainingClickButton.disabled = true;     // ← 消さずに操作不能
  jumpButton.classList.remove("hidden");   // ← ジャンプ出現

  isTraining = true;
  setModeButtonsLocked(true);

  startRunAnimation();

  score = 0;
  scoreSpan.textContent = score;

  let set = spawnSet();
  obstacleX = set.obstacleX;
  carrotX   = set.carrotX;
  carrotY   = set.carrotY;


  let obstacleActive = true;
  let carrotActive   = true;

  const screen = document.getElementById("scroll-training");
  const ground = document.getElementById("ground");
  screen.classList.remove("hidden");

  let groundX = 0;
  let time = 0;

  // ★ 機嫌による制限時間（秒）
  const trainingTimeSec = getTrainingTimeByMood(gameData.status.mood);
  const trainingFrameLimit = trainingTimeSec * 60; // 60fps想定

  const interval = setInterval(() => {
    time++;

    const scrollSpeed = getScrollSpeed();

    // ===== 地面 =====
    groundX -= scrollSpeed;
    if (groundX <= -300) groundX = 0;
    ground.style.left = groundX + "px";

    // ===== ジャンプ =====
    const jp = getJumpPhysics();
    velocityY += jp.gravity;
    horseY += velocityY;
    if (horseY < GROUND_Y) {
      horseY = GROUND_Y;
      velocityY = 0;
      isJumping = false;
    }
    horse.style.bottom = (20 + horseY) + "px";

    // ===== 障害物 =====
    obstacleX -= scrollSpeed;
    obstacle.style.left = obstacleX + "px";

    if (obstacleX < -60 && carrotX < -60) {
     const set = spawnSet();
     obstacleX = set.obstacleX;
     carrotX   = set.carrotX;
     carrotY   = set.carrotY;
     obstacleActive = true;
     carrotActive   = true;
   }

    // ===== 人参 =====
    carrotX -= scrollSpeed;
    carrot.style.left = carrotX + "px";
    carrot.style.bottom = (30 + carrotY) + "px";


    if (carrotX < -60) {
      carrotActive = true;
    }

// ===== 当たり判定（複数ヒットボックス）=====

// 障害物
if (obstacleActive) {

  const obstacleRect = obstacle.getBoundingClientRect();

  if (isHorseHit(obstacleRect)) {

    score = Math.max(0, score - 1);

    obstacleActive = false;
    obstacleX = -100;
  }
}

// 人参
if (carrotActive) {

  const carrotRect = carrot.getBoundingClientRect();

  if (isHorseHit(carrotRect)) {

    score += 1;

    carrotActive = false;
    carrotX = -100;
  }
}

    scoreSpan.textContent = score;

    if (time >= trainingFrameLimit) {
      clearInterval(interval);
      screen.classList.add("hidden");

      stopRunAnimation();

      isTraining = false;
      setModeButtonsLocked(false);

      difficultyButton.disabled = false;

      // ボタンを元に戻す
      jumpButton.classList.add("hidden");
      trainingClickButton.disabled = false;

      // TRAININGモードに留まる
      switchScreen(SCREEN.TRAINING);
      updateModeButtonActive(SCREEN.TRAINING); // ★ 明示的に再付与

      // 成長処理
      doTraining(score);
    }

  }, 16);
}


// =====================
// フェーズB：ジャンプ用状態
// =====================
let horseY = 0;          // 地面からの高さ
let velocityY = 0;       // 縦速度
const GRAVITY = -0.8;    // 重力
const JUMP_POWER = 12;   // ジャンプ初速
const GROUND_Y = 0;      // 地面

function jump() {
  if (horseY === GROUND_Y) {
    const jp = getJumpPhysics();
    velocityY = jp.jump;
    isJumping = true;
  }
}

// =====================
// 滞空時間補正（難易度用）
// =====================

function getJumpPhysics() {
  const diff = gameData.training.difficulty;

  // 基準値
  const baseGravity = GRAVITY;
  const baseJump    = JUMP_POWER;

  if (diff === 1) {
    const k = 0.5; // ★ 時間をゆっくりにする倍率
    return {
      gravity: baseGravity * k,
      jump: baseJump * Math.sqrt(k)
    };
  }

  if (diff === 2) {
    const k = 0.8; // ★ 時間をゆっくりにする倍率
    return {
      gravity: baseGravity * k,
      jump: baseJump * Math.sqrt(k)
    };
  }

  return {
    gravity: baseGravity,
    jump: baseJump
  };
}

// =====================
// 距離表示用ユーティリティ関数
// =====================
function formatDistanceKm(meters) {
  const km = meters / 1000;
  return km.toFixed(3) + " km";
}

// =====================
// 速度表示用ユーティリティ関数
// =====================
function formatSpeedKmH(speed_mph) {
  const kmh = speed_mph / 1000;
  return kmh.toFixed(3) + " km/h";
}

// =====================
// 表示
// =====================
function render() {
  updateDailyFeedCount();
  updateDailyMood();

  // ⑴ 左上：日時・名前（最低限 名前のみ）
  statusMainDiv.innerHTML =
    "【" + gameData.horse.name + "】";

  // ⑵ 右上：コアステータス
  statusCoreDiv.innerHTML =
    "基礎走力：" + formatSpeedKmH(gameData.horse.speed) + "<br>" +
    "加速力：" + Math.floor(gameData.horse.acceleration) + "<br>" +
    "累積距離：" + formatDistanceKm(gameData.progress.totalRunDistance);

  // ⑶ 左下：機嫌テキスト
  statusMoodDiv.textContent =
    getMoodText(gameData.status.mood);

  // ⑷ 右下：元気度・満腹度
  statusConditionDiv.innerHTML =
    "元気度：" + Math.floor(gameData.status.energy) + "<br>" +
    "満腹度：" + Math.floor(gameData.status.fullness);
  // ★ 給餌残り回数表示
  updateFeedRemainingText();

  updateDifficultyUI();

  updateRunActionLock();
}

// =====================
// セーブ
// =====================
function save() {
  localStorage.setItem("gameData", JSON.stringify(gameData));
}

// =====================
// 馬の名前設定のためのイベントハンドラ
// =====================
horseNameApply.addEventListener("click", () => {
  const name = horseNameInput.value.trim();
  if (name === "") {
    alert("名前を入力してください");
    return;
  }
  gameData.horse.name = name;
  save();
  render();
  alert("名前を設定しました");
});

// =====================
// テストボタン
// =====================

// 現在スクロールゲームを起動するように設定中
trainingClickButton.addEventListener("click", () => {
  confirmWakeIfSleeping(startScrollTraining);
});

runStartButton.addEventListener("click", () => {
  confirmWakeIfSleeping(startRun);
});

jumpButton.addEventListener("click", () => {
  if (isTraining) {
    jump();
  }
});

feedButton.addEventListener("click", () => {
  confirmWakeIfSleeping(feedHorse);
});

cameraBtn.addEventListener("click", () => {
  startCamera();
});

cameraCancelBtn.addEventListener("click", () => {
  stopCamera();

  cameraControls.classList.add("hidden");
  feedControls.classList.remove("hidden");
});

// =====================
// 開発用リセット
// =====================
resetButton.addEventListener("click", () => {
  if (!confirm("localStorage を初期化しますか？")) return;
  localStorage.removeItem("gameData");
  gameData = createInitialGameData();

  updateDailyMood(); // ★ 追加：初日分の機嫌を確定
  save();
  render();
});

// =====================
// 開発用ステータス調整
// =====================
document.getElementById("dev-toggle").addEventListener("click", () => {
  const panel = document.getElementById("dev-panel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
});

document.getElementById("dev-apply").addEventListener("click", () => {
  const s = document.getElementById("dev-speed").value;
  const a = document.getElementById("dev-acc").value;
  const d = document.getElementById("dev-dist").value;

  if (s !== "") gameData.horse.speed = Number(s);
  if (a !== "") gameData.horse.acceleration = Number(a);
  if (d !== "") gameData.progress.totalRunDistance = Number(d);

  save();
  render();
});

// =====================
// 実走：表示切替（中央＋右ボタン式）
// =====================

let isRunMapView = false; // false=グラフ / true=地図

const viewGraph = document.getElementById("run-view-graph");
const viewMap   = document.getElementById("run-view-map");

function updateRunView() {

  if (isRunMapView) {

    // 地図表示
    viewMap.classList.remove("hidden");
    viewGraph.classList.add("hidden");

    runViewToggleBtn.textContent = "グラフ";

    // 地図再描画対策
    setTimeout(() => {
      initRunMap();

      if (map) {
        map.invalidateSize();
      }
    }, 100);

  } else {

    // グラフ表示
    viewGraph.classList.remove("hidden");
    viewMap.classList.add("hidden");

    runViewToggleBtn.textContent = "地図";
  }
}

// ボタンクリック
runViewToggleBtn.onclick = () => {
  isRunMapView = !isRunMapView;
  updateRunView();
};

// =====================
// 初期処理
// =====================
updateDailyMood();

switchScreen(SCREEN.HOME);
updateModeButtonActive(SCREEN.HOME); // ★ 明示的に確定
render();

// =====================
// 再読み込み時の実走復元
// =====================
if (gameData.time.isRunning) {

  isMapAutoFollow = true; // ★ 強制ON

  switchScreen(SCREEN.RUNNING);
  resumeRunFromElapsed();
}