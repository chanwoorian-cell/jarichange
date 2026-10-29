import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutGrid, Users, UserX, UserPlus, Save, RotateCcw, History, Bookmark, 
  CheckCircle, AlertCircle, ArrowRightLeft, EyeOff, Copy, Trash2, 
  Edit2, Check, X, Download, Upload, Shield, Eye,
  HelpCircle, Shuffle, BookOpen, Sparkles, HeartHandshake, Link, Unlink
} from 'lucide-react';

// 클라우드 저장소(Firebase) 모듈 임포트
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

let app = null;
let auth = null;
let db = null;

try {
  const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config 
    ? JSON.parse(__firebase_config) 
    : {};
  if (firebaseConfig && firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.warn("Firebase Config not available or failed to load. Running in local fallback mode.", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'smart-seat-allocator-app';

export default function App() {
  const [activeTab, setActiveTab] = useState('generator'); // 'generator', 'pair', 'history', 'saved', 'guide'
  
  // 클라우드 인증 및 로딩 상태
  const [user, setUser] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 상태 관리: 일반 자리배치 설정 (1:1 성비 예시 학생 20명: 남 10명, 여 10명)
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(4);
  const [fillFrontFirst, setFillFrontFirst] = useState(true); 
  const [useHistory, setUseHistory] = useState(true); // 히스토리 반영 옵션

  const [studentInput, setStudentInput] = useState(
    '김민석, 이철수, 김유신, 이순신, 강감찬, 안중근, 윤봉길, 정약용, 장영실, 세종대왕, 박영희, 홍길동, 유관순, 신사임당, 허난설헌, 논개, 김만덕, 이선희, 최수빈, 정은지'
  );
  
  // 교사 전용 조건: 학생 떼어놓기(짝 금지) & 학생 붙이기(반드시 짝)
  const [avoidInput, setAvoidInput] = useState('김민석, 이철수\n박영희, 홍길동');
  const [mustInput, setMustInput] = useState('안중근, 윤봉길\n신사임당, 정약용');
  
  // 상태 관리: 일반 자리배치 데이터
  const [currentGrid, setCurrentGrid] = useState(null);
  const [savedRecords, setSavedRecords] = useState([]);
  const [secretGrid, setSecretGrid] = useState(null);

  // 상태 관리: 뷰어 및 수동 교체
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [swapSource, setSwapSource] = useState(null);
  
  // 교사 / 학생 스크린 모드 (기본값: 학생 공개 모드 = true)
  const [isStudentView, setIsStudentView] = useState(true); 

  // 저장 기록 이름 수정 상태
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  // 알림 토스트 상태
  const [notification, setNotification] = useState(null);

  // 짝·분단 모드 설정 (정확히 남 10명, 여 10명 = 1:1 성비)
  const [pairStudentInput, setPairStudentInput] = useState(
    '김민석(남), 이철수(남), 김유신(남), 이순신(남), 강감찬(남), 안중근(남), 윤봉길(남), 정약용(남), 장영실(남), 세종대왕(남),\n박영희(여), 홍길동(여), 유관순(여), 신사임당(여), 허난설헌(여), 논개(여), 김만덕(여), 이선희(여), 최수빈(여), 정은지(여)'
  );
  const [pairType, setPairType] = useState('mixed'); // 'mixed'(이성짝), 'samesex'(동성짝), 'random'(랜덤짝)
  const [pairDirection, setPairDirection] = useState('femaleLeft'); // 'femaleLeft'(여L/남R), 'femaleRight'(남L/여R), 'random'(랜덤)
  const [groupDivisionCount, setGroupDivisionCount] = useState(2); // 분단 수 (1, 2, 3, 4분단)
  
  // 짝 모드 신규 추가 규칙: 전짝 피하기 & 전분단 피하기
  const [avoidPrevPair, setAvoidPrevPair] = useState(true);
  const [avoidPrevDivision, setAvoidPrevDivision] = useState(true);

  const [generatedPairs, setGeneratedPairs] = useState([]); // [{id, p1: {name, gender}, p2: {name, gender}}]
  const [unpairedStudents, setUnpairedStudents] = useState([]); // [{name, gender, reason}]

  // 저장된 기록(savedRecords)을 기반으로 누적 자리 히스토리 계산
  const seatHistory = useMemo(() => {
    const history = {};
    savedRecords.forEach(record => {
      if (!record.grid) return;
      record.grid.forEach((rowArr, r) => {
        rowArr.forEach((student, c) => {
          if (student) {
            if (!history[student]) history[student] = {};
            const seatKey = `${c + 1}열 ${r + 1}행`;
            history[student][seatKey] = (history[student][seatKey] || 0) + 1;
          }
        });
      });
    });
    return history;
  }, [savedRecords]);

  // 저장된 기록을 기반으로 이전에 짝을 했던 횟수 맵 (전짝 히스토리)
  const prevPairHistoryMap = useMemo(() => {
    const pairMap = {};
    const addPair = (a, b) => {
      if (!a || !b || a === b) return;
      if (!pairMap[a]) pairMap[a] = {};
      if (!pairMap[b]) pairMap[b] = {};
      pairMap[a][b] = (pairMap[a][b] || 0) + 1;
      pairMap[b][a] = (pairMap[b][a] || 0) + 1;
    };

    savedRecords.forEach(record => {
      if (record.type === 'pair' && record.pairs) {
        record.pairs.forEach(p => {
          if (p.p1 && p.p2) addPair(p.p1.name, p.p2.name);
        });
      } else if (record.grid) {
        // 일반 자리 배치의 인접 칸도 이전 짝으로 간주
        const grid = record.grid;
        for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < grid[r].length; c++) {
            const st = grid[r][c];
            if (!st) continue;
            // 오른쪽과 짝
            if (c + 1 < grid[r].length && grid[r][c + 1]) addPair(st, grid[r][c + 1]);
          }
        }
      }
    });
    return pairMap;
  }, [savedRecords]);

  // 저장된 기록을 기반으로 특정 학생이 앉았던 분단/구획 히스토리
  const prevDivisionHistoryMap = useMemo(() => {
    const divMap = {};
    savedRecords.forEach(record => {
      if (record.type === 'pair' && record.pairs) {
        const divCount = record.groupDivisionCount || 2;
        record.pairs.forEach((pair, idx) => {
          const divIdx = idx % divCount;
          [pair.p1.name, pair.p2.name].forEach(st => {
            if (!divMap[st]) divMap[st] = {};
            divMap[st][divIdx] = (divMap[st][divIdx] || 0) + 1;
          });
        });
      }
    });
    return divMap;
  }, [savedRecords]);

  const showNotification = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 3200);
  };

  useEffect(() => {
    if (!auth) {
      setIsLoaded(true);
      return;
    }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("인증 오류:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) {
      try {
        const localData = localStorage.getItem('smart_seat_allocator_local');
        if (localData) {
          const parsed = JSON.parse(localData);
          if (parsed.rows) setRows(Number(parsed.rows));
          if (parsed.cols) setCols(Number(parsed.cols));
          if (parsed.fillFrontFirst !== undefined) setFillFrontFirst(Boolean(parsed.fillFrontFirst));
          if (parsed.useHistory !== undefined) setUseHistory(Boolean(parsed.useHistory));
          if (parsed.studentInput) setStudentInput(String(parsed.studentInput));
          if (parsed.avoidInput !== undefined) setAvoidInput(String(parsed.avoidInput));
          if (parsed.mustInput !== undefined) setMustInput(String(parsed.mustInput));
          if (parsed.currentGrid) setCurrentGrid(parsed.currentGrid);
          if (parsed.savedRecords) setSavedRecords(parsed.savedRecords || []);
          if (parsed.secretGrid) setSecretGrid(parsed.secretGrid);
          if (parsed.pairStudentInput) setPairStudentInput(parsed.pairStudentInput);
          if (parsed.generatedPairs) setGeneratedPairs(parsed.generatedPairs);
          if (parsed.unpairedStudents) setUnpairedStudents(parsed.unpairedStudents);
          if (parsed.avoidPrevPair !== undefined) setAvoidPrevPair(Boolean(parsed.avoidPrevPair));
          if (parsed.avoidPrevDivision !== undefined) setAvoidPrevDivision(Boolean(parsed.avoidPrevDivision));
        }
      } catch (e) {
        console.error("Local reading error", e);
      }
      setIsLoaded(true);
      return;
    }

    const loadData = async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'seatAllocator', 'mainData');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          const safeParse = (val) => {
            if (typeof val === 'string') {
              try { return JSON.parse(val); } catch(e) { return val; }
            }
            return val;
          };

          if (data.rows) setRows(Number(data.rows));
          if (data.cols) setCols(Number(data.cols));
          if (data.fillFrontFirst !== undefined) setFillFrontFirst(Boolean(data.fillFrontFirst));
          if (data.useHistory !== undefined) setUseHistory(Boolean(data.useHistory));
          if (data.studentInput) setStudentInput(String(data.studentInput));
          if (data.avoidInput !== undefined) setAvoidInput(String(data.avoidInput));
          if (data.mustInput !== undefined) setMustInput(String(data.mustInput));
          if (data.currentGrid) setCurrentGrid(safeParse(data.currentGrid));
          if (data.savedRecords) setSavedRecords(safeParse(data.savedRecords) || []);
          if (data.secretGrid) setSecretGrid(safeParse(data.secretGrid));
          if (data.pairStudentInput) setPairStudentInput(String(data.pairStudentInput));
          if (data.generatedPairs) setGeneratedPairs(safeParse(data.generatedPairs) || []);
          if (data.unpairedStudents) setUnpairedStudents(safeParse(data.unpairedStudents) || []);
          if (data.avoidPrevPair !== undefined) setAvoidPrevPair(Boolean(data.avoidPrevPair));
          if (data.avoidPrevDivision !== undefined) setAvoidPrevDivision(Boolean(data.avoidPrevDivision));
        }
      } catch (e) {
        console.error("데이터 불러오기 오류:", e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, [user]);

  useEffect(() => {
    if (!isLoaded) return;
    const timeoutId = setTimeout(() => {
      const dataToSave = {
        rows, cols, fillFrontFirst, useHistory, studentInput, avoidInput, mustInput,
        currentGrid: typeof currentGrid === 'string' ? currentGrid : JSON.stringify(currentGrid), 
        savedRecords: typeof savedRecords === 'string' ? savedRecords : JSON.stringify(savedRecords),
        secretGrid: typeof secretGrid === 'string' ? secretGrid : JSON.stringify(secretGrid),
        pairStudentInput,
        generatedPairs: JSON.stringify(generatedPairs),
        unpairedStudents: JSON.stringify(unpairedStudents),
        avoidPrevPair, avoidPrevDivision
      };

      try {
        localStorage.setItem('smart_seat_allocator_local', JSON.stringify({
          rows, cols, fillFrontFirst, useHistory, studentInput, avoidInput, mustInput, currentGrid, savedRecords, secretGrid,
          pairStudentInput, generatedPairs, unpairedStudents, avoidPrevPair, avoidPrevDivision
        }));
      } catch (e) {}

      if (user && db) {
        const privateRef = doc(db, 'artifacts', appId, 'users', user.uid, 'seatAllocator', 'mainData');
        setDoc(privateRef, dataToSave, { merge: true }).catch(err => console.error("개인 저장 오류:", err));
      }

    }, 800);
    
    return () => clearTimeout(timeoutId);
  }, [rows, cols, fillFrontFirst, useHistory, studentInput, avoidInput, mustInput, currentGrid, savedRecords, secretGrid, pairStudentInput, generatedPairs, unpairedStudents, avoidPrevPair, avoidPrevDivision, user, isLoaded]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.key.toLowerCase() === 's') {
        setIsStudentView(prev => !prev);
        showNotification(!isStudentView ? '학생용 스크린 모드로 전환되었습니다.' : '선생님 관리자 모드로 전환되었습니다.');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStudentView]);

  const handleExport = () => {
    const data = {
      rows, cols, fillFrontFirst, useHistory, studentInput, avoidInput, mustInput,
      currentGrid, savedRecords, secretGrid, pairStudentInput, generatedPairs, unpairedStudents,
      avoidPrevPair, avoidPrevDivision
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `자리배치_백업_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '').replace(/ /g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('모든 백업 데이터가 파일로 다운로드되었습니다!');
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      showNotification('JSON 백업 파일만 업로드할 수 있습니다.', true);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let text = event.target.result.replace(/^\uFEFF/, '').trim();
        const data = JSON.parse(text);

        const safeParse = (val) => {
          if (typeof val === 'string') {
            try { return JSON.parse(val); } catch(err) { return val; }
          }
          return val;
        };

        if (data.rows !== undefined) setRows(Number(data.rows));
        if (data.cols !== undefined) setCols(Number(data.cols));
        if (data.fillFrontFirst !== undefined) setFillFrontFirst(Boolean(data.fillFrontFirst));
        if (data.useHistory !== undefined) setUseHistory(Boolean(data.useHistory));
        if (data.studentInput !== undefined) setStudentInput(String(data.studentInput));
        if (data.avoidInput !== undefined) setAvoidInput(String(data.avoidInput));
        if (data.mustInput !== undefined) setMustInput(String(data.mustInput));
        if (data.currentGrid !== undefined) setCurrentGrid(safeParse(data.currentGrid));
        if (data.savedRecords !== undefined) setSavedRecords(safeParse(data.savedRecords) || []);
        if (data.secretGrid !== undefined) setSecretGrid(safeParse(data.secretGrid));
        if (data.pairStudentInput !== undefined) setPairStudentInput(String(data.pairStudentInput));
        if (data.generatedPairs !== undefined) setGeneratedPairs(safeParse(data.generatedPairs) || []);
        if (data.unpairedStudents !== undefined) setUnpairedStudents(safeParse(data.unpairedStudents) || []);
        if (data.avoidPrevPair !== undefined) setAvoidPrevPair(Boolean(data.avoidPrevPair));
        if (data.avoidPrevDivision !== undefined) setAvoidPrevDivision(Boolean(data.avoidPrevDivision));
        
        showNotification('백업 데이터를 성공적으로 복원했습니다! 🎉');
      } catch (err) {
        console.error("Import Error:", err);
        showNotification(`파일 형식이 올바르지 않습니다. (${err.message})`, true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const saveSecretGrid = () => {
    if (!currentGrid) return;
    const clonedGrid = currentGrid.map(row => [...row]);
    setSecretGrid(clonedGrid);
    showNotification('지정석 비밀 배치가 안전하게 저장되었습니다!');
  };

  // 규칙 파싱 함수 (줄바꿈 구분, 각 줄당 학생 2명 이상)
  const parseRulePairs = (inputText) => {
    return inputText.split('\n')
      .map(line => line.split(/[\s,]+/).filter(s => s.trim() !== ''))
      .filter(rule => rule.length >= 2);
  };

  // === [구체화된 알고리즘 1: 일반 자리배치 시뮬레이션 Engine] ===
  const generateSeating = (e) => {
    if (e && e.ctrlKey && secretGrid) {
      setCurrentGrid(secretGrid.map(row => [...row]));
      setSwapSource(null);
      showNotification('지정석 비밀 배치를 불러왔습니다! ✨');
      return;
    }

    const students = studentInput.split(/[\s,]+/).filter(s => s.trim() !== '');
    
    if (students.length === 0) {
      showNotification('학생 이름을 입력해주세요.', true);
      return;
    }
    if (students.length > rows * cols) {
      showNotification(`학생 수(${students.length}명)가 좌석 수(${rows * cols}개)보다 많습니다.`, true);
      return;
    }

    const avoidRules = parseRulePairs(avoidInput); // 짝 금지 규칙
    const mustRules = parseRulePairs(mustInput);   // 반드시 짝 규칙

    // 인접 여부 확인 (가로/세로/대각선 인접)
    const isAdjacent = (r1, c1, r2, c2) => {
      return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;
    };

    let bestGrid = null;
    let minPenalty = Infinity;

    // 몬테카를로 최적화 탐색 (1000회 시도 중 벌점 최저 상태 선택)
    for (let attempt = 0; attempt < 1000; attempt++) {
      let grid = Array(rows).fill(null).map(() => Array(cols).fill(null));
      let shuffled = [...students].sort(() => Math.random() - 0.5);
      
      // 좌석 후보지에 무작위배치
      let seatPositions = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          seatPositions.push({ r, c });
        }
      }
      seatPositions.sort(() => Math.random() - 0.5);

      shuffled.forEach((student, idx) => {
        const seat = seatPositions[idx];
        grid[seat.r][seat.c] = student;
      });

      // === 벌점 계산 (Penalty Scoring) ===
      let penalty = 0;

      // 1. 하드 규칙: 짝 금지 (Forbidden Pairs) -> 위반 시 엄청난 패널티
      avoidRules.forEach(rule => {
        for (let i = 0; i < rule.length; i++) {
          for (let j = i + 1; j < rule.length; j++) {
            const s1 = rule[i], s2 = rule[j];
            let pos1 = null, pos2 = null;
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                if (grid[r][c] === s1) pos1 = { r, c };
                if (grid[r][c] === s2) pos2 = { r, c };
              }
            }
            if (pos1 && pos2 && isAdjacent(pos1.r, pos1.c, pos2.r, pos2.c)) {
              penalty += 50000; // 절대 배치 불가능 수준 벌점
            }
          }
        }
      });

      // 2. 하드 규칙: 반드시 짝 (Mandatory Pairs) -> 인접하지 않으면 패널티
      mustRules.forEach(rule => {
        for (let i = 0; i < rule.length; i++) {
          for (let j = i + 1; j < rule.length; j++) {
            const s1 = rule[i], s2 = rule[j];
            let pos1 = null, pos2 = null;
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                if (grid[r][c] === s1) pos1 = { r, c };
                if (grid[r][c] === s2) pos2 = { r, c };
              }
            }
            if (pos1 && pos2 && !isAdjacent(pos1.r, pos1.c, pos2.r, pos2.c)) {
              penalty += 20000;
            }
          }
        }
      });

      // 3. 소프트 규칙: 앞자리 우선 채우기
      if (fillFrontFirst) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (grid[r][c]) {
              penalty += r * 50; // 행 번호가 높을수록(뒷자리) 벌점 부여
            }
          }
        }
      }

      // 4. 소프트 규칙: 히스토리 반영 (자주 앉은 자리 피하기)
      if (useHistory) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const st = grid[r][c];
            if (st && seatHistory[st]) {
              const seatKey = `${c + 1}열 ${r + 1}행`;
              const pastCount = seatHistory[st][seatKey] || 0;
              penalty += pastCount * 300;
            }
          }
        }
      }

      if (penalty < minPenalty) {
        minPenalty = penalty;
        bestGrid = grid;
      }

      // 벌점이 0인 완벽한 결과를 찾으면 즉시 종료
      if (minPenalty === 0) break;
    }

    if (bestGrid && minPenalty < 50000) {
      setCurrentGrid(bestGrid);
      setSwapSource(null);
      showNotification('최적의 조건으로 자리 배치가 완료되었습니다! ✨');
    } else {
      // 제약조건이 지나치게 강한 경우 최선의 시도 제공 및 경고
      setCurrentGrid(bestGrid);
      showNotification('일부 필수 조건(떼어놓기/붙이기) 충돌 가능성이 있습니다. 조건 완화를 권장합니다.', true);
    }
  };

  const parsePairStudents = (rawText) => {
    const items = rawText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const parsed = [];

    items.forEach(item => {
      const match = item.match(/^(.+?)\s*\((남|여|남학생|여학생|m|f|male|female)\)$/i);
      if (match) {
        const name = match[1].trim();
        const gTag = match[2].toLowerCase();
        const gender = (gTag === '여' || gTag === '여학생' || gTag === 'f' || gTag === 'female') ? 'female' : 'male';
        parsed.push({ name, gender });
      } else {
        parsed.push({ name: item, gender: 'male' });
      }
    });
    return parsed;
  };

  // === [구체화된 알고리즘 2: 짝·분단 시뮬레이션 Engine] ===
  const generatePairings = () => {
    const rawInput = pairStudentInput.trim() ? pairStudentInput : studentInput;
    const students = parsePairStudents(rawInput);

    if (students.length === 0) {
      showNotification('학생 명단을 입력해주세요.', true);
      return;
    }

    const avoidRules = parseRulePairs(avoidInput); // 짝 금지
    const mustRules = parseRulePairs(mustInput);   // 반드시 짝

    let bestCandidate = null;
    let minPenalty = Infinity;

    // 몬테카를로 탐색 (1000회 무작위 조합 중 벌점 최하위 탐색)
    for (let attempt = 0; attempt < 1000; attempt++) {
      let males = [...students.filter(s => s.gender === 'male')].sort(() => Math.random() - 0.5);
      let females = [...students.filter(s => s.gender === 'female')].sort(() => Math.random() - 0.5);
      let allShuffled = [...students].sort(() => Math.random() - 0.5);

      let candidatePairs = [];
      let candidateLeftover = [];

      if (pairType === 'mixed') {
        const minCount = Math.min(males.length, females.length);
        for (let i = 0; i < minCount; i++) {
          const m = males[i];
          const f = females[i];
          let left = f, right = m;
          if (pairDirection === 'femaleRight') { left = m; right = f; }
          else if (pairDirection === 'random' && Math.random() < 0.5) { left = m; right = f; }
          candidatePairs.push({ id: i + 1, p1: left, p2: right });
        }
        males.slice(minCount).forEach(m => candidateLeftover.push({ ...m, reason: '남학생 남음 (이성짝 수 부족)' }));
        females.slice(minCount).forEach(f => candidateLeftover.push({ ...f, reason: '여학생 남음 (이성짝 수 부족)' }));

      } else if (pairType === 'samesex') {
        let pId = 1;
        while (males.length >= 2) candidatePairs.push({ id: pId++, p1: males.pop(), p2: males.pop() });
        if (males.length === 1) candidateLeftover.push({ ...males[0], reason: '남학생 홀수' });
        while (females.length >= 2) candidatePairs.push({ id: pId++, p1: females.pop(), p2: females.pop() });
        if (females.length === 1) candidateLeftover.push({ ...females[0], reason: '여학생 홀수' });

      } else {
        // random
        let pId = 1;
        while (allShuffled.length >= 2) candidatePairs.push({ id: pId++, p1: allShuffled.pop(), p2: allShuffled.pop() });
        if (allShuffled.length === 1) candidateLeftover.push({ ...allShuffled[0], reason: '홀수 남은 학생' });
      }

      // === 짝 벌점 평가 (Pair Penalty Calculation) ===
      let penalty = 0;

      candidatePairs.forEach((pair, pIdx) => {
        const s1 = pair.p1.name;
        const s2 = pair.p2.name;
        const divIdx = pIdx % groupDivisionCount;

        // 1. 짝 금지 규칙 위반 패널티
        avoidRules.forEach(rule => {
          if (rule.includes(s1) && rule.includes(s2)) penalty += 50000;
        });

        // 2. 반드시 짝 규칙 가산점 (위반 시 벌점)
        mustRules.forEach(rule => {
          if ((rule.includes(s1) && !rule.includes(s2)) || (!rule.includes(s1) && rule.includes(s2))) {
            penalty += 2000; // 반드시 짝인데 다른 사람과 짝이 되었을 때
          }
        });

        // 3. 전짝 피하기 (Avoid Previous Pair)
        if (avoidPrevPair && prevPairHistoryMap[s1] && prevPairHistoryMap[s1][s2]) {
          const pastPairCount = prevPairHistoryMap[s1][s2];
          penalty += pastPairCount * 8000; // 전짝 위반시 높은 벌점
        }

        // 4. 전자리/전분단 피하기 (Avoid Previous Division)
        if (avoidPrevDivision) {
          if (prevDivisionHistoryMap[s1] && prevDivisionHistoryMap[s1][divIdx]) {
            penalty += prevDivisionHistoryMap[s1][divIdx] * 1200;
          }
          if (prevDivisionHistoryMap[s2] && prevDivisionHistoryMap[s2][divIdx]) {
            penalty += prevDivisionHistoryMap[s2][divIdx] * 1200;
          }
        }
      });

      if (penalty < minPenalty) {
        minPenalty = penalty;
        bestCandidate = { pairs: candidatePairs, leftover: candidateLeftover };
      }

      if (minPenalty === 0) break;
    }

    if (bestCandidate) {
      setGeneratedPairs(bestCandidate.pairs);
      setUnpairedStudents(bestCandidate.leftover);
      showNotification('전짝·전분단 피하기 및 조건이 반영된 짝 배치가 완료되었습니다! 👥');
    }
  };

  const saveCurrentSeating = () => {
    if (!currentGrid) return;
    const record = {
      id: Date.now(),
      type: 'grid',
      title: `${savedRecords.length + 1}차 자리배치`,
      date: new Date().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      grid: currentGrid,
      rows, cols
    };
    setSavedRecords([record, ...savedRecords]);
    showNotification('현재 배치가 성공적으로 저장 기록에 추가되었습니다.');
  };

  const saveCurrentPairing = () => {
    if (generatedPairs.length === 0 && unpairedStudents.length === 0) return;
    const pairTypeName = pairType === 'mixed' ? '이성짝' : pairType === 'samesex' ? '동성짝' : '랜덤짝';
    const record = {
      id: Date.now(),
      type: 'pair',
      title: `${savedRecords.length + 1}차 짝·분단 (${pairTypeName}, ${groupDivisionCount}분단)`,
      date: new Date().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      pairs: generatedPairs,
      unpaired: unpairedStudents,
      pairType, pairDirection, groupDivisionCount
    };
    setSavedRecords([record, ...savedRecords]);
    showNotification('현재 짝·분단 배치가 저장 기록에 추가되었습니다!');
  };

  const copyPairToSpreadsheet = (pairsToCopy, unpairedToCopy, divCount = groupDivisionCount) => {
    if (!pairsToCopy || pairsToCopy.length === 0) return;
    let textLines = ["분단\t짝 번호\t학생1\t성별1\t학생2\t성별2"];
    
    const divisions = Array.from({ length: divCount }, () => []);
    pairsToCopy.forEach((pair, idx) => {
      divisions[idx % divCount].push(pair);
    });

    divisions.forEach((divPairs, dIdx) => {
      divPairs.forEach((pair, pIdx) => {
        const g1 = pair.p1.gender === 'female' ? '여' : '남';
        const g2 = pair.p2.gender === 'female' ? '여' : '남';
        textLines.push(`${dIdx + 1}분단\t${pIdx + 1}번 짝\t${pair.p1.name}\t${g1}\t${pair.p2.name}\t${g2}`);
      });
    });

    if (unpairedToCopy && unpairedToCopy.length > 0) {
      textLines.push("\n[짝 미완성 / 남은 학생]");
      unpairedToCopy.forEach(st => {
        const g = st.gender === 'female' ? '여' : '남';
        textLines.push(`미배정\t-\t${st.name}\t${g}\t${st.reason || ''}`);
      });
    }

    const tsvData = textLines.join("\n");
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(tsvData)
        .then(() => showNotification('구글 시트용 TSV 데이터가 클립보드에 복사되었습니다! (Ctrl+V)'))
        .catch(() => fallbackCopy(tsvData));
    } else {
      fallbackCopy(tsvData);
    }
  };

  const handleSeatClick = (r, c) => {
    if (activeTab !== 'generator' || !currentGrid) return;
    if (!swapSource) {
      setSwapSource({ r, c });
    } else {
      if (swapSource.r === r && swapSource.c === c) {
        setSwapSource(null);
        return;
      }
      const newGrid = [...currentGrid.map(row => [...row])];
      const temp = newGrid[swapSource.r][swapSource.c];
      newGrid[swapSource.r][swapSource.c] = newGrid[r][c];
      newGrid[r][c] = temp;
      setCurrentGrid(newGrid);
      setSwapSource(null);
      showNotification('선택한 두 학생의 자리를 맞바꿨습니다.');
    }
  };

  const copyToSpreadsheet = (gridToCopy) => {
    if (!gridToCopy) return;
    const tsvData = gridToCopy.map(rowArr => 
      rowArr.map(student => student || '').join('\t\t')
    ).join('\n\n\n');

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(tsvData)
        .then(() => showNotification('구글 시트용 데이터가 복사되었습니다! (Ctrl+V)'))
        .catch(() => fallbackCopy(tsvData));
    } else {
      fallbackCopy(tsvData);
    }
  };

  const fallbackCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showNotification('클립보드에 복사되었습니다! (Ctrl+V)');
    } catch (err) {
      showNotification('복사에 실패했습니다.', true);
    }
    document.body.removeChild(textArea);
  };

  const deleteRecord = (id) => {
    setSavedRecords(savedRecords.filter(r => r.id !== id));
    if (selectedRecord?.id === id) setSelectedRecord(null);
    showNotification('기록이 삭제되었습니다.');
  };

  const saveRecordTitle = (id) => {
    const updated = savedRecords.map(r => {
      if (r.id === id) {
        const newRecord = { ...r, title: editTitle || r.title };
        if (selectedRecord && selectedRecord.id === id) setSelectedRecord(newRecord);
        return newRecord;
      }
      return r;
    });
    setSavedRecords(updated);
    setEditingRecordId(null);
    showNotification('기록 이름이 변경되었습니다.');
  };

  const DeskGrid = ({ grid, highlightStudent, historyData, onSeatClick, swapSource }) => {
    if (!grid) return <div className="text-gray-500 text-center py-10 font-medium">생성된 배치가 없습니다.</div>;

    return (
      <div className="flex flex-col items-center overflow-x-auto w-full py-4 select-none">
        <div className="w-2/3 max-w-lg bg-slate-800 text-white text-center py-2.5 rounded-b-2xl mb-8 shadow-md font-bold tracking-widest border-t-4 border-indigo-500 text-base">
          칠판 / 교탁 (앞)
        </div>

        <div className="flex items-stretch gap-4 md:gap-8 xl:gap-10 min-w-max">
          <div className="flex items-center justify-center bg-slate-100/60 px-2 rounded-xl border border-dashed border-slate-300">
             <div className="text-slate-400 font-bold tracking-[0.4em] text-sm md:text-base" style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}>
               복 도
             </div>
          </div>
          
          <div className="flex flex-col gap-3 md:gap-4">
            {grid.map((rowArr, r) => (
              <div key={`row-${r}`} className="flex gap-3 md:gap-4">
                {rowArr.map((student, c) => {
                  const seatKey = `${c + 1}열 ${r + 1}행`;
                  const historyCount = historyData ? (historyData[seatKey] || 0) : 0;
                  
                  let bgClass = "bg-amber-50/80 hover:bg-amber-100 border-amber-200 text-slate-800";
                  let isSelectedForSwap = false;

                  if (historyData) {
                    if (historyCount > 0) {
                      bgClass = "bg-indigo-100 border-indigo-300 text-indigo-900 font-bold shadow-sm";
                    } else {
                      bgClass = "bg-slate-50 border-slate-200 text-slate-300 opacity-60";
                    }
                  } else {
                    if (swapSource && swapSource.r === r && swapSource.c === c) {
                      isSelectedForSwap = true;
                      bgClass = "bg-indigo-100 border-indigo-500 text-indigo-900 ring-4 ring-indigo-200 shadow-md scale-105 z-10 font-bold";
                    } else if (!student) {
                      bgClass = "bg-slate-100 border-dashed border-slate-300 text-slate-400 hover:bg-slate-200/60";
                    } else if (highlightStudent === student) {
                      bgClass = "bg-emerald-100 border-emerald-400 text-emerald-900 ring-2 ring-emerald-400 font-bold scale-105 shadow-sm";
                    }
                  }

                  return (
                    <div 
                      key={`seat-${r}-${c}`}
                      onClick={() => onSeatClick && onSeatClick(r, c)}
                      className={`relative w-24 h-20 sm:w-28 sm:h-24 md:w-32 md:h-28 rounded-xl border-2 shadow-sm flex flex-col items-center justify-center transition-all ${onSeatClick ? 'cursor-pointer hover:shadow-md' : ''} ${bgClass}`}
                    >
                      <span className="text-[11px] sm:text-xs text-slate-400 absolute top-1.5 left-2 font-semibold">{c+1}열</span>
                      <span className="text-[11px] sm:text-xs text-slate-400 absolute top-1.5 right-2 font-semibold">{r+1}행</span>
                      
                      {isSelectedForSwap && (
                        <div className="absolute -top-2.5 -right-2.5 bg-indigo-600 text-white rounded-full p-1 shadow-md animate-bounce">
                          <ArrowRightLeft size={14} />
                        </div>
                      )}

                      {historyData ? (
                        <div className="text-center mt-2">
                          {historyCount > 0 ? (
                            <span className="font-extrabold text-lg sm:text-xl text-indigo-700">{historyCount}회</span>
                          ) : (
                            <span className="text-xs text-slate-300">-</span>
                          )}
                        </div>
                      ) : (
                        <span className="font-bold text-sm sm:text-base md:text-lg mt-3 truncate max-w-[90%] text-center">
                          {student || '빈 자리'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center bg-blue-50/60 px-2 rounded-xl border border-dashed border-blue-200">
             <div className="text-blue-400 font-bold tracking-[0.4em] text-sm md:text-base" style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}>
               창 문
             </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
         <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
         <p className="text-indigo-600 font-bold text-sm">스마트 학급 자리를 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-3 sm:p-5 md:p-6 font-sans">
      <div className="w-full max-w-[1600px] mx-auto space-y-5">
        
        {/* Header Navigation */}
        <header className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-md">
              <Sparkles size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">스마트 학급 자리배치</h1>
              <p className="text-xs text-slate-500">몬테카를로 최적화 기반 자동 자리배치 & 짝·분단 스마트 솔루션</p>
            </div>
          </div>
          
          <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs sm:text-sm gap-1">
            <button 
              onClick={() => setActiveTab('generator')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold transition-all ${activeTab === 'generator' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <RotateCcw size={16} /> 일반 자리배치
            </button>
            
            <button 
              onClick={() => setActiveTab('pair')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold transition-all ${activeTab === 'pair' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Users size={16} /> 짝·분단 모드
            </button>

            <button 
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold transition-all ${activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <History size={16} /> 히스토리
            </button>
            
            <button 
              onClick={() => setActiveTab('saved')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold transition-all ${activeTab === 'saved' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Bookmark size={16} /> 저장된 기록
            </button>

            <button 
              onClick={() => setActiveTab('guide')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold transition-all ${activeTab === 'guide' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <HelpCircle size={16} /> 기능 안내
            </button>
          </div>
        </header>

        {/* Global Toast Notification */}
        {notification && (
          <div className={`fixed top-6 right-6 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-white z-50 animate-bounce text-xs sm:text-sm font-semibold ${notification.isError ? 'bg-rose-500' : 'bg-emerald-600'}`}>
            {notification.isError ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span>{notification.msg}</span>
          </div>
        )}

        {/* TAB 1: 일반 자리배치 */}
        {activeTab === 'generator' && (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-1 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-5">
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="text-base font-bold flex items-center gap-2 text-slate-800">
                  <LayoutGrid size={18} className="text-indigo-600"/> 배치 규칙 설정
                </h2>
                <button
                  onClick={() => setIsStudentView(!isStudentView)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold flex items-center gap-1"
                  title="학생들에게 민감한 제약조건을 가리려면 클릭하세요 (Alt+S)"
                >
                  {isStudentView ? <Eye size={14}/> : <Shield size={14}/>}
                  <span>{isStudentView ? '학생 공개 모드' : '교사 관리자 모드'}</span>
                </button>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">행 (세로 줄 수)</label>
                  <input type="number" min="1" max="15" value={rows} onChange={e => setRows(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"/>
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">열 (가로 칸 수)</label>
                  <input type="number" min="1" max="15" value={cols} onChange={e => setCols(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"/>
                </div>
              </div>

              {/* 기본 체크박스 옵션 */}
              <div className="flex flex-col gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 select-none">
                  <input 
                    type="checkbox" 
                    checked={fillFrontFirst} 
                    onChange={e => setFillFrontFirst(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                  />
                  <span>앞 자리(1행)부터 채우기</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 select-none">
                  <input 
                    type="checkbox" 
                    checked={useHistory} 
                    onChange={e => setUseHistory(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                  />
                  <span>과거 기록 반영 (자주 앉은 자리 피하기)</span>
                </label>
              </div>

              {/* 학생 명단 (1:1 성비 20명 예시) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex justify-between">
                  <span>학생 명단 (20명)</span>
                  <span className="text-[11px] text-slate-400">쉼표 또는 띄어쓰기</span>
                </label>
                <textarea 
                  rows="4" 
                  value={studentInput} 
                  onChange={e => setStudentInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs leading-relaxed resize-none font-mono"
                  placeholder="김민석, 이철수, 박영희..."
                />
              </div>

              {/* 교사 관리자 모드 옵션: 학생 붙이기 & 학생 떼어놓기 */}
              {!isStudentView && (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-indigo-700 flex items-center gap-1">
                      <Link size={14} className="text-indigo-600"/> 학생 붙이기 (반드시 짝/인접)
                    </label>
                    <p className="text-[10px] text-slate-400">한 줄에 한 쌍씩 적어주세요 (예: 안중근, 윤봉길).</p>
                    <textarea 
                      rows="2" 
                      value={mustInput} 
                      onChange={e => setMustInput(e.target.value)}
                      className="w-full px-3 py-1.5 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs resize-none font-mono bg-indigo-50/30"
                      placeholder="안중근, 윤봉길&#10;신사임당, 정약용"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-rose-600 flex items-center gap-1">
                      <Unlink size={14} className="text-rose-500"/> 학생 떼어놓기 (짝 금지)
                    </label>
                    <p className="text-[10px] text-slate-400">한 줄에 한 쌍씩 적어주세요 (예: 김민석, 이철수).</p>
                    <textarea 
                      rows="2" 
                      value={avoidInput} 
                      onChange={e => setAvoidInput(e.target.value)}
                      className="w-full px-3 py-1.5 border border-rose-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-xs resize-none font-mono bg-rose-50/30"
                      placeholder="김민석, 이철수&#10;박영희, 홍길동"
                    />
                  </div>
                </div>
              )}

              {/* 액션 버튼 그룹 */}
              <div className="pt-2 flex flex-col gap-2">
                <button 
                  onClick={generateSeating}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all flex justify-center items-center gap-2 shadow-sm active:scale-95"
                >
                  <RotateCcw size={16} /> 자리 배치하기
                </button>
                
                <button 
                  onClick={saveCurrentSeating}
                  disabled={!currentGrid}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex justify-center items-center gap-2 shadow-sm ${currentGrid ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                  <Save size={16} /> 현재 배치 저장 및 기록
                </button>

                {!isStudentView && (
                  <button 
                    onClick={saveSecretGrid}
                    disabled={!currentGrid}
                    className={`w-full py-2 rounded-xl text-xs font-semibold transition-all flex justify-center items-center gap-1.5 border ${currentGrid ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'}`}
                    title="현재 배치를 지정석으로 저장해 두고 Ctrl + 배치 버튼 클릭 시 복원합니다."
                  >
                    <EyeOff size={14} /> 지정석 비밀 저장
                  </button>
                )}

                {/* PC 백업 및 파일 열기 */}
                <div className="border-t border-slate-200 pt-3 mt-1 space-y-2">
                  <p className="text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    💾 데이터 백업 & 복원
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleExport}
                      className="flex-1 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-colors flex justify-center items-center gap-1 border border-slate-200 shadow-sm"
                    >
                      <Download size={13} /> PC 백업
                    </button>
                    <label 
                      className="flex-1 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-colors flex justify-center items-center gap-1 border border-slate-200 shadow-sm cursor-pointer"
                    >
                      <Upload size={13} /> 파일 열기
                      <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 결과 뷰 영역 */}
            <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 min-h-[580px] flex flex-col items-center justify-center">
              {currentGrid && (
                <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-3 mb-4 px-4 py-2.5 bg-indigo-50/80 rounded-xl border border-indigo-100 text-xs text-indigo-900">
                  <span className="font-medium flex items-center gap-1.5">
                    <ArrowRightLeft size={15} className="text-indigo-600 shrink-0" /> 학생 칸 2개를 연속으로 클릭하면 서로 자리를 바꿀 수 있습니다.
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {swapSource && (
                      <button onClick={() => setSwapSource(null)} className="px-2.5 py-1 bg-white text-slate-700 rounded-lg border hover:bg-slate-100 shadow-sm font-bold">
                        선택 취소
                      </button>
                    )}
                    <button onClick={() => copyToSpreadsheet(currentGrid)} className="px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm font-bold flex items-center gap-1">
                      <Copy size={13} /> 구글 시트로 복사
                    </button>
                  </div>
                </div>
              )}
              
              <DeskGrid 
                grid={currentGrid} 
                onSeatClick={handleSeatClick}
                swapSource={swapSource}
              />
            </div>
          </div>
        )}

        {/* TAB 2: 짝·분단 모드 */}
        {activeTab === 'pair' && (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* 설정 패널 */}
            <div className="xl:col-span-1 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-5">
              <div className="border-b pb-3">
                <h2 className="text-base font-bold flex items-center gap-2 text-slate-800">
                  <Users size={18} className="text-indigo-600"/> 짝·분단 설정
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">짝 형태, 전짝 피하기, 분단 배치를 한눈에 설정합니다.</p>
              </div>

              {/* 1. 짝 구성 방식 선택 */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">1. 짝 구성 방식</label>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <button 
                    onClick={() => setPairType('mixed')}
                    className={`py-2 px-1 rounded-xl font-bold border transition-all ${pairType === 'mixed' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                  >
                    👫 이성짝
                  </button>
                  <button 
                    onClick={() => setPairType('samesex')}
                    className={`py-2 px-1 rounded-xl font-bold border transition-all ${pairType === 'samesex' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                  >
                    👬 동성짝
                  </button>
                  <button 
                    onClick={() => setPairType('random')}
                    className={`py-2 px-1 rounded-xl font-bold border transition-all ${pairType === 'random' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                  >
                    🔀 랜덤짝
                  </button>
                </div>
              </div>

              {/* 신규 피하기 제약조건 체크박스 (전짝 피하기 / 전분단 피하기) */}
              <div className="flex flex-col gap-2.5 bg-indigo-50/70 p-3 rounded-xl border border-indigo-100 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-900 select-none">
                  <input 
                    type="checkbox" 
                    checked={avoidPrevPair} 
                    onChange={e => setAvoidPrevPair(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-indigo-300 rounded"
                  />
                  <span>🔄 전짝 피하기 (이전 짝과 다시 짝 방지)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-900 select-none">
                  <input 
                    type="checkbox" 
                    checked={avoidPrevDivision} 
                    onChange={e => setAvoidPrevDivision(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-indigo-300 rounded"
                  />
                  <span>🏢 전자리 / 전분단 피하기 (이전 분단 위치 회피)</span>
                </label>
              </div>

              {/* 이성짝 좌우 방향 설정 */}
              {pairType === 'mixed' && (
                <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <label className="text-xs font-bold text-slate-800 block">2. 이성짝 좌우 방향 설정</label>
                  <div className="flex flex-col gap-1.5 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 bg-white p-2 rounded-lg border border-slate-200">
                      <input 
                        type="radio" 
                        name="direction"
                        checked={pairDirection === 'femaleLeft'}
                        onChange={() => setPairDirection('femaleLeft')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>👩 여자 왼쪽 / 👨 남자 오른쪽</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 bg-white p-2 rounded-lg border border-slate-200">
                      <input 
                        type="radio" 
                        name="direction"
                        checked={pairDirection === 'femaleRight'}
                        onChange={() => setPairDirection('femaleRight')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>👨 남자 왼쪽 / 👩 여자 오른쪽</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 bg-white p-2 rounded-lg border border-slate-200">
                      <input 
                        type="radio" 
                        name="direction"
                        checked={pairDirection === 'random'}
                        onChange={() => setPairDirection('random')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>🎲 좌우 무작위 (랜덤)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* 분단 수 설정 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">3. 분단 수 (구획 구분)</label>
                <select 
                  value={groupDivisionCount} 
                  onChange={e => setGroupDivisionCount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-semibold bg-white"
                >
                  <option value={1}>1 분단 (전체 나열)</option>
                  <option value={2}>2 분단 (좌 / 우)</option>
                  <option value={3}>3 분단 (좌 / 중앙 / 우)</option>
                  <option value={4}>4 분단 (모둠형 배치)</option>
                </select>
              </div>

              {/* 짝 명단 입력 (정확히 남 10, 여 10 = 1:1 성비 예시) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex justify-between">
                  <span>학생 명단 & 성별 (남 10명, 여 10명)</span>
                  <span className="text-[11px] text-indigo-600 font-bold">이름(남), 이름(여)</span>
                </label>
                <textarea 
                  rows="5" 
                  value={pairStudentInput} 
                  onChange={e => setPairStudentInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs leading-relaxed resize-none font-mono"
                  placeholder="김민석(남), 박영희(여)..."
                />
              </div>

              {/* 생성 및 저장 버튼 */}
              <div className="pt-2 space-y-2">
                <button 
                  onClick={generatePairings}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all flex justify-center items-center gap-2 shadow-sm active:scale-95"
                >
                  <Shuffle size={16} /> 짝 구성 & 스마트 섞기
                </button>
                
                <button 
                  onClick={saveCurrentPairing}
                  disabled={generatedPairs.length === 0}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex justify-center items-center gap-2 shadow-sm ${generatedPairs.length > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                  <Save size={16} /> 현재 짝·분단 저장 및 기록
                </button>
              </div>
            </div>

            {/* 결과 뷰 영역 */}
            <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 min-h-[580px] flex flex-col justify-between">
              
              {generatedPairs.length === 0 && unpairedStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center my-auto text-slate-400 space-y-3 py-16">
                  <Users size={48} className="text-slate-300" />
                  <p className="text-sm font-bold">왼쪽 '짝 구성 & 스마트 섞기' 버튼을 누르면 분단 배치가 시작됩니다.</p>
                  <p className="text-xs text-slate-400">전짝 피하기 및 전분단 피하기 옵션이 자동으로 계산됩니다.</p>
                </div>
              ) : (
                <div className="space-y-6 w-full">
                  
                  <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-3 px-4 py-2.5 bg-indigo-50/80 rounded-xl border border-indigo-100 text-xs text-indigo-900">
                    <span className="font-medium flex items-center gap-1.5">
                      <CheckCircle size={15} className="text-indigo-600 shrink-0" /> 완성된 짝 결과를 보관하거나 시트로 복사할 수 있습니다.
                    </span>
                    <button onClick={() => copyPairToSpreadsheet(generatedPairs, unpairedStudents)} className="px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm font-bold flex items-center gap-1 shrink-0">
                      <Copy size={13} /> 구글 시트로 복사
                    </button>
                  </div>

                  <div className="w-2/3 max-w-md mx-auto bg-slate-800 text-white text-center py-2.5 rounded-b-2xl shadow-md font-bold tracking-widest text-sm border-t-4 border-indigo-500">
                    칠판 / 교탁 (앞)
                  </div>

                  {/* 분단 그리드 */}
                  {(() => {
                    const divisions = Array.from({ length: groupDivisionCount }, () => []);
                    generatedPairs.forEach((pair, idx) => {
                      const divIdx = idx % groupDivisionCount;
                      divisions[divIdx].push(pair);
                    });

                    return (
                      <div className={`grid grid-cols-1 ${groupDivisionCount === 2 ? 'md:grid-cols-2' : groupDivisionCount >= 3 ? 'md:grid-cols-3' : ''} gap-6`}>
                        {divisions.map((divPairs, dIdx) => (
                          <div key={`div-${dIdx}`} className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col gap-3">
                            <div className="text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 py-1.5 px-3 rounded-xl text-center">
                              {dIdx + 1} 분단 ({divPairs.length}쌍)
                            </div>

                            <div className="space-y-2.5">
                              {divPairs.map((pair, pIdx) => (
                                <div key={pair.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
                                  <div className="text-[11px] font-bold text-slate-400 mb-1 flex justify-between">
                                    <span>{pIdx + 1}번 짝</span>
                                    <span className="text-indigo-500 font-semibold">{pairType === 'mixed' ? '이성짝' : pairType === 'samesex' ? '동성짝' : '랜덤짝'}</span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 text-center">
                                    <div className={`py-2.5 px-2 rounded-lg border font-bold text-sm sm:text-base ${pair.p1.gender === 'female' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
                                      <span className="text-[10px] block font-normal text-slate-400">{pair.p1.gender === 'female' ? '여' : '남'}</span>
                                      {pair.p1.name}
                                    </div>

                                    <div className={`py-2.5 px-2 rounded-lg border font-bold text-sm sm:text-base ${pair.p2.gender === 'female' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
                                      <span className="text-[10px] block font-normal text-slate-400">{pair.p2.gender === 'female' ? '여' : '남'}</span>
                                      {pair.p2.name}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* 남은 학생 예외 안내 */}
                  {unpairedStudents.length > 0 && (
                    <div className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-2xl p-4 space-y-2 mt-4">
                      <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                        <AlertCircle size={18} />
                        <span>짝 미완성 / 남은 학생 ({unpairedStudents.length}명)</span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {unpairedStudents.map((st, idx) => (
                          <div key={idx} className="bg-white border border-amber-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 shadow-sm flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${st.gender === 'female' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
                              {st.gender === 'female' ? '여' : '남'}
                            </span>
                            <span>{st.name}</span>
                            <span className="text-[10px] text-amber-600 font-normal">({st.reason})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              <div className="mt-6 border-t pt-3 text-xs text-slate-400 flex justify-between items-center">
                <span>* 버튼을 누르면 설정 규칙에 맞춰 몬테카를로 최적 조합을 다시 계산합니다.</span>
                <span className="text-indigo-600 font-semibold">총 {generatedPairs.length * 2 + unpairedStudents.length}명 처리 완료</span>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: 학생별 히스토리 */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="lg:w-1/3 space-y-4">
                <h2 className="text-base font-bold border-b pb-2 text-slate-800">학생 선택</h2>
                <select 
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium bg-slate-50"
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                >
                  <option value="">학생을 선택하세요</option>
                  {Object.keys(seatHistory).sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>

                {selectedStudent && seatHistory[selectedStudent] && (
                  <div className="bg-indigo-50/80 rounded-xl p-4 border border-indigo-100 space-y-3">
                    <h3 className="font-bold text-sm text-indigo-900 border-b border-indigo-200/60 pb-1.5">
                      '{selectedStudent}' 학생의 좌석 착석 횟수
                    </h3>
                    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                      {Object.entries(seatHistory[selectedStudent])
                        .sort((a, b) => b[1] - a[1])
                        .map(([seat, count]) => (
                        <div key={seat} className="flex justify-between items-center bg-white px-3 py-1.5 rounded-lg border border-indigo-100 text-xs">
                          <span className="font-semibold text-slate-700">{seat}</span>
                          <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[11px] font-bold">{count}회 앉음</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {!selectedStudent && (
                  <div className="text-slate-500 text-xs p-5 bg-slate-50 rounded-xl text-center border border-dashed border-slate-200 leading-relaxed">
                    목록에서 학생 이름을 선택하시면 그동안 어떤 자리에 몇 번 앉았는지 시각적인 히트맵으로 확인하실 수 있습니다.
                  </div>
                )}
              </div>

              <div className="lg:w-2/3 flex flex-col items-center justify-center bg-slate-50/50 rounded-2xl p-4 border border-slate-200/60 min-h-[400px]">
                {selectedStudent ? (
                  <div className="w-full flex flex-col items-center">
                    <p className="text-xs font-bold text-indigo-700 mb-2 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                      '{selectedStudent}' 학생의 자리별 누적 착석 히트맵
                    </p>
                    <DeskGrid 
                      grid={currentGrid || Array(rows).fill(null).map(() => Array(cols).fill(null))} 
                      historyData={seatHistory[selectedStudent]}
                    />
                  </div>
                ) : (
                  <div className="text-slate-400 text-sm font-medium">
                    학생을 선택하면 우측에 착석 히트맵이 표시됩니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: 저장된 기록 */}
        {activeTab === 'saved' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
            <div className="flex flex-col lg:flex-row gap-6">
              
              <div className="lg:w-1/3 space-y-3">
                <h2 className="text-base font-bold border-b pb-2 text-slate-800">저장된 회차별 기록 ({savedRecords.length}개)</h2>
                {savedRecords.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center italic">저장된 배치 기록이 없습니다.</p>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {savedRecords.map(record => {
                      const isSelected = selectedRecord?.id === record.id;
                      const isEditing = editingRecordId === record.id;

                      return (
                        <div 
                          key={record.id}
                          onClick={() => setSelectedRecord(record)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${isSelected ? 'bg-indigo-50/90 border-indigo-300 ring-2 ring-indigo-200 shadow-sm' : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/80'}`}
                        >
                          <div className="flex justify-between items-center">
                            {isEditing ? (
                              <div className="flex items-center gap-1 flex-1 mr-2">
                                <input 
                                  type="text" 
                                  value={editTitle}
                                  onChange={e => setEditTitle(e.target.value)}
                                  className="px-2 py-1 text-xs border rounded w-full outline-none"
                                  onClick={e => e.stopPropagation()}
                                />
                                <button onClick={(e) => { e.stopPropagation(); saveRecordTitle(record.id); }} className="text-emerald-600 p-1">
                                  <Check size={14} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setEditingRecordId(null); }} className="text-slate-400 p-1">
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <span className="font-bold text-xs sm:text-sm text-slate-800 flex items-center gap-1.5">
                                {record.type === 'pair' ? (
                                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-extrabold">짝·분단</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-extrabold">자리배치</span>
                                )}
                                {record.title || '배치 기록'}
                              </span>
                            )}

                            <div className="flex items-center gap-1">
                              {!isEditing && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingRecordId(record.id);
                                    setEditTitle(record.title || '');
                                  }}
                                  className="text-slate-400 hover:text-slate-600 p-1 rounded"
                                  title="이름 수정"
                                >
                                  <Edit2 size={13} />
                                </button>
                              )}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteRecord(record.id);
                                }}
                                className="text-rose-400 hover:text-rose-600 p-1 rounded"
                                title="기록 삭제"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-[11px] text-slate-400">
                            <span>{record.date}</span>
                            <span>{record.type === 'pair' ? `${record.groupDivisionCount || 2}분단` : `${record.rows}행 x ${record.cols}열`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="lg:w-2/3 bg-slate-50/50 rounded-2xl p-5 border border-slate-200/60 flex flex-col items-center justify-center min-h-[450px]">
                {selectedRecord ? (
                  <div className="w-full flex flex-col items-center">
                    <div className="w-full flex justify-between items-center mb-4 px-3 py-2 bg-white rounded-xl border border-slate-200">
                      <div>
                        <h3 className="font-bold text-sm text-slate-800">{selectedRecord.title}</h3>
                        <p className="text-[11px] text-slate-400">{selectedRecord.date}</p>
                      </div>
                      <div className="flex gap-2">
                        {selectedRecord.type === 'pair' ? (
                          <>
                            <button 
                              onClick={() => {
                                setGeneratedPairs(selectedRecord.pairs || []);
                                setUnpairedStudents(selectedRecord.unpaired || []);
                                if (selectedRecord.pairType) setPairType(selectedRecord.pairType);
                                if (selectedRecord.groupDivisionCount) setGroupDivisionCount(selectedRecord.groupDivisionCount);
                                setActiveTab('pair');
                                showNotification('선택한 짝·분단 기록을 불러왔습니다.');
                              }}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
                            >
                              이 배치를 짝·분단 모드로 불러오기
                            </button>
                            <button 
                              onClick={() => copyPairToSpreadsheet(selectedRecord.pairs, selectedRecord.unpaired, selectedRecord.groupDivisionCount || 2)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1"
                            >
                              <Copy size={13} /> 복사
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => {
                                setCurrentGrid(selectedRecord.grid);
                                setRows(selectedRecord.rows);
                                setCols(selectedRecord.cols);
                                setActiveTab('generator');
                                showNotification('선택한 기록을 현재 배치로 복원했습니다.');
                              }}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
                            >
                              이 배치를 현재 배치로 불러오기
                            </button>
                            <button 
                              onClick={() => copyToSpreadsheet(selectedRecord.grid)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1"
                            >
                              <Copy size={13} /> 복사
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {selectedRecord.type === 'pair' || selectedRecord.pairs ? (
                      <div className="w-full space-y-4">
                        {(() => {
                          const divCount = selectedRecord.groupDivisionCount || 2;
                          const divisions = Array.from({ length: divCount }, () => []);
                          (selectedRecord.pairs || []).forEach((pair, idx) => {
                            divisions[idx % divCount].push(pair);
                          });

                          return (
                            <div className={`grid grid-cols-1 ${divCount === 2 ? 'md:grid-cols-2' : divCount >= 3 ? 'md:grid-cols-3' : ''} gap-4`}>
                              {divisions.map((divPairs, dIdx) => (
                                <div key={`div-saved-${dIdx}`} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                                  <div className="text-xs font-bold text-indigo-700 text-center bg-indigo-50 py-1 rounded">
                                    {dIdx + 1} 분단 ({divPairs.length}쌍)
                                  </div>
                                  {divPairs.map((pair, pIdx) => (
                                    <div key={pair.id} className="text-xs border p-2 rounded flex justify-between items-center">
                                      <span className="font-bold text-slate-400">{pIdx + 1}번</span>
                                      <span className="font-semibold text-slate-800">{pair.p1.name} & {pair.p2.name}</span>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <DeskGrid grid={selectedRecord.grid} />
                    )}
                  </div>
                ) : (
                  <div className="text-slate-400 text-sm font-medium">
                    왼쪽 목록에서 기록을 선택하면 배치 결과를 확인할 수 있습니다.
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 5: 매뉴얼 안내 */}
        {activeTab === 'guide' && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-8">
            <div className="border-b pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="text-emerald-600" size={24} /> 선생님을 위한 스마트 학급 자리배치 매뉴얼
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  몬테카를로 최적화 시뮬레이션 알고리즘 기반 스마트 배치 사용법 안내입니다.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-base">
                  <LayoutGrid size={20} />
                  <span>🪑 일반 자리배치 & 몬테카를로 알고리즘</span>
                </div>
                <div className="text-xs text-slate-700 leading-relaxed space-y-2">
                  <p className="font-semibold text-indigo-900">
                    💡 최대 1,000회 시뮬레이션을 통해 교사의 제약조건(붙이기, 떼어놓기, 히스토리, 앞자리 채우기)을 완벽히 만족하는 구도를 계산합니다.
                  </p>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-800 block">📌 사용 방법</span>
                    <ol className="list-disc list-inside text-slate-600 space-y-0.5">
                      <li>행(줄)과 열(칸)을 입력하고 명단을 작성합니다.</li>
                      <li>필요시 '학생 붙이기', '학생 떼어놓기' 조건을 추가합니다.</li>
                      <li>'자리 배치하기' 버튼 클릭 시 알고리즘이 실행됩니다.</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-base">
                  <Users size={20} />
                  <span>👥 짝·분단 모드 & 전짝/전분단 피하기</span>
                </div>
                <div className="text-xs text-slate-700 leading-relaxed space-y-2">
                  <p className="font-semibold text-indigo-900">
                    💡 이성짝, 동성짝, 랜덤짝 외에도 이전 저장기록을 분석하여 이전 짝이나 이전 분단 위치를 자동으로 회피합니다.
                  </p>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-800 block">📌 사용 옵션</span>
                    <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                      <li><strong>전짝 피하기:</strong> 이전 회차에 이미 짝을 했던 적이 있는 조합을 자동 차단합니다.</li>
                      <li><strong>전자리/전분단 피하기:</strong> 이전에 정해진 분단 구획에 다시 배치되지 않도록 조정합니다.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-base">
                  <HeartHandshake size={20} />
                  <span>🔗 교사 전용 제약조건 (붙이기 & 떼어놓기)</span>
                </div>
                <div className="text-xs text-slate-700 leading-relaxed space-y-2">
                  <p className="font-semibold text-indigo-900">
                    💡 반드시 짝을 맺어야 하는 학생 그룹과 절대로 짝이 되면 안 되는 학생 그룹을 개별 지정할 수 있습니다.
                  </p>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                    <p className="text-slate-600">
                      교사 관리자 모드(Alt+S)에서 한 줄에 한 쌍씩 학생 이름을 작성해 주시면 시뮬레이션 시 최우선 순위로 반영됩니다.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-base">
                  <Shield size={20} />
                  <span>🔒 교사 보안 & 학생 공개 스크린 모드 (Alt+S)</span>
                </div>
                <div className="text-xs text-slate-700 leading-relaxed space-y-2">
                  <p className="font-semibold text-indigo-900">
                    💡 학생들에게 민감한 제약조건(학생 붙이기, 떼어놓기 목록 등)을 가려주는 화면 모드입니다.
                  </p>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                    <p className="text-slate-600">
                      단축키 <strong>Alt + S</strong>를 누르면 학생들에게 프로젝터나 TV로 화면을 공유할 수 있는 깔끔한 학생용 뷰로 전환됩니다.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}